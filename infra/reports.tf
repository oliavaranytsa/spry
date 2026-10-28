# The weekly report (Lab 5), formerly infra/reports.yaml, event-driven:
#   EventBridge Scheduler -> SQS (+ DLQ) -> builder Lambda (in the VPC, reads
#   Aurora) -> S3 reports/<week>.csv -> mailer Lambda (outside the VPC) -> SES.
#
# The bucket holds every report built so far. Read every plan for "forces
# replacement" on aws_s3_bucket.reports.

locals {
  reports_bucket = "${var.project_name}-reports-${local.account_id}"
  recipients     = var.reports_recipient != "" ? var.reports_recipient : var.reports_sender
}

# --- the bucket, and its settings as separate resources ---------------------
# In the AWS provider these are resources that point at the bucket, not
# properties inside it. That is also what removes Lab 5's circular
# dependency: bucket, permission and notification are three resources, and
# the notification simply comes last.

resource "aws_s3_bucket" "reports" {
  bucket = local.reports_bucket
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket                  = aws_s3_bucket.reports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    bucket_key_enabled = false
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "expire-reports"
    status = "Enabled"
    filter {
      prefix = "reports/"
    }
    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_notification" "reports" {
  bucket = aws_s3_bucket.reports.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.mailer.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "reports/"
    filter_suffix       = ".csv"
  }

  depends_on = [aws_lambda_permission.mailer_from_s3]
}

# The builder is in a VPC with no NAT: it reaches S3 through this free gateway.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = local.backend_vpc.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = data.aws_route_tables.vpc.ids
}

# --- the queue --------------------------------------------------------------

resource "aws_sqs_queue" "requests_dlq" {
  name                      = "${var.project_name}-report-requests-dlq"
  message_retention_seconds = 1209600 # 14 days, the maximum
  max_message_size          = 1048576 # 1 MiB, what SQS now gives by default
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "requests" {
  name                       = "${var.project_name}-report-requests"
  visibility_timeout_seconds = var.queue_visibility_timeout
  max_message_size           = 1048576 # 1 MiB, what SQS now gives by default
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.requests_dlq.arn
    maxReceiveCount     = 3
  })
}

# --- the builder: in the VPC, next to the database --------------------------
# CloudFormation named these roles itself; the names are kept so that the
# roles are adopted, not replaced.

resource "aws_iam_role" "builder" {
  name = "spry-reports-BuilderRole-v2z4ozYBO93p"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "builder_vpc" {
  role       = aws_iam_role.builder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Receive and delete from the queue: the Lambda service polls it for us.
resource "aws_iam_role_policy_attachment" "builder_sqs" {
  role       = aws_iam_role.builder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role_policy" "builder_write_reports" {
  name = "write-reports"
  role = aws_iam_role.builder.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:PutObject"
      Resource = "${aws_s3_bucket.reports.arn}/reports/*"
    }]
  })
}

resource "aws_cloudwatch_log_group" "builder" {
  name              = "/aws/lambda/${var.project_name}-report-builder"
  retention_in_days = var.reports_log_retention_days
}

resource "aws_lambda_function" "builder" {
  function_name = "${var.project_name}-report-builder"
  description   = "Builds reports/<week>.csv from Aurora"
  role          = aws_iam_role.builder.arn

  # Same image as the API, another entry point.
  package_type  = "Image"
  image_uri     = local.backend_image
  architectures = [local.backend_arch]
  image_config {
    command = ["app.reports.lambda_handler.handler"]
  }

  memory_size = 512
  timeout     = var.builder_timeout

  vpc_config {
    subnet_ids         = local.backend_vpc.subnet_ids
    security_group_ids = local.backend_vpc.security_group_ids
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.builder.name
  }

  environment {
    variables = {
      APP_ENV        = "production"
      DB_POOLING     = "false"
      DATABASE_URL   = local.database_url
      REPORTS_BUCKET = aws_s3_bucket.reports.bucket
      FAIL_WEEK      = var.fail_week
    }
  }

  # The application pipeline (make deploy-backend, GitHub Actions) moves the
  # image forward on every deploy. Infrastructure owns the function, the
  # application owns the code in it.
  lifecycle {
    ignore_changes = [image_uri]
  }
}

# One message per invocation: a failed report retries alone.
resource "aws_lambda_event_source_mapping" "builder" {
  event_source_arn = aws_sqs_queue.requests.arn
  function_name    = aws_lambda_function.builder.arn
  batch_size       = 1
  enabled          = true
}

# --- the schedule: a command on the queue every Monday ----------------------

resource "aws_iam_role" "scheduler" {
  name = "spry-reports-SchedulerRole-V9CrFecqCVsS"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.account_id }
      }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_send" {
  name = "send-report-request"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sqs:SendMessage"
      Resource = aws_sqs_queue.requests.arn
    }]
  })
}

resource "aws_scheduler_schedule" "weekly" {
  name        = "${var.project_name}-weekly-report"
  group_name  = "default"
  description = "BuildWeeklyReport for the previous ISO week"

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sqs_queue.requests.arn
    role_arn = aws_iam_role.scheduler.arn
    # week: null - the builder picks the previous ISO week. Written out as
    # the exact string the schedule already has, so the plan sees no change.
    input = "{\"week\": null, \"source\": \"schedule\"}"

    retry_policy {
      maximum_event_age_in_seconds = 86400
      maximum_retry_attempts       = 185
    }
  }
}

# --- the mailer: outside the VPC, reacts to the file -------------------------

resource "aws_iam_role" "mailer" {
  name = "spry-reports-MailerRole-XKLTT2VRVBgE"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "mailer_logs" {
  role       = aws_iam_role.mailer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Read reports and send email, and nothing that writes to reports/: a function
# triggered by uploads there that uploads there calls itself forever.
resource "aws_iam_role_policy" "mailer_read_and_mail" {
  name = "read-and-mail"
  role = aws_iam_role.mailer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.reports.arn}/reports/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "arn:aws:ses:${var.region}:${local.account_id}:identity/*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "mailer" {
  name              = "/aws/lambda/${var.project_name}-report-mailer"
  retention_in_days = var.reports_log_retention_days
}

# The code that CloudFormation kept inline (ZipFile) is now a file next to
# this one, zipped at plan time.
data "archive_file" "mailer" {
  type        = "zip"
  source_file = "${path.module}/mailer/index.py"
  output_path = "${path.module}/.terraform/mailer.zip"
}

resource "aws_lambda_function" "mailer" {
  function_name = "${var.project_name}-report-mailer"
  description   = "Emails a new reports/*.csv through SES"
  role          = aws_iam_role.mailer.arn

  runtime          = "python3.13"
  handler          = "index.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.mailer.output_path
  source_code_hash = data.archive_file.mailer.output_base64sha256

  memory_size = 256
  timeout     = 30

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.mailer.name
  }

  environment {
    variables = {
      PROJECT_NAME = var.project_name
      SENDER       = var.reports_sender
      RECIPIENTS   = local.recipients
    }
  }
}

# Imported with the statement id CloudFormation generated.
resource "aws_lambda_permission" "mailer_from_s3" {
  statement_id   = "spry-reports-MailerInvokePermission-m0jFdClVYTOk"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.mailer.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.reports.arn
  source_account = local.account_id
}

# --- SES: email-address identities (no domain of our own) --------------------

resource "aws_sesv2_email_identity" "sender" {
  email_identity = var.reports_sender
}

resource "aws_sesv2_email_identity" "recipient" {
  count          = var.reports_recipient != "" && var.reports_recipient != var.reports_sender ? 1 : 0
  email_identity = var.reports_recipient
}
