# The agenda parser (Lab 6), formerly infra/ai.yml: a Lambda function behind
# its own function URL that turns pasted text into an agenda with Claude on
# Amazon Bedrock. Outside the VPC (it needs no database), and it never writes:
# saving goes through the main API.

resource "aws_iam_role" "parser" {
  name = "spry-ai-ParserRole-AwizcfTVOGtS"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Logs only: no VPC access, no database, no S3.
resource "aws_iam_role_policy_attachment" "parser_logs" {
  role       = aws_iam_role.parser.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "parser_call_claude" {
  name = "call-claude"
  role = aws_iam_role.parser.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Current Claude models, through the Anthropic Messages API on Bedrock.
      { Effect = "Allow", Action = "bedrock-mantle:CreateInference", Resource = "*" },
      # Older models, through bedrock-runtime and an inference profile.
      { Effect = "Allow", Action = "bedrock:InvokeModel", Resource = "*" },
    ]
  })
}

resource "aws_cloudwatch_log_group" "parser" {
  name              = "/aws/lambda/${var.project_name}-agenda-parser"
  retention_in_days = var.parser_log_retention_days
}

resource "aws_lambda_function" "parser" {
  function_name = "${var.project_name}-agenda-parser"
  description   = "Pasted text in, agenda JSON out (Claude on Bedrock). Never writes."
  role          = aws_iam_role.parser.arn

  # Same image as the API, another entry point. No vpc_config on purpose.
  package_type  = "Image"
  image_uri     = local.backend_image
  architectures = [local.backend_arch]
  image_config {
    command = ["app.ai.agenda_lambda.handler"]
  }

  memory_size = 512
  timeout     = 30

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.parser.name
  }

  environment {
    variables = {
      APP_ENV              = "production"
      PARSER_MODEL         = var.parser_model
      PARSER_REGION        = var.parser_region
      COGNITO_REGION       = var.region
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.web.id
    }
  }

  # The application pipeline moves the image; see the builder in reports.tf.
  lifecycle {
    ignore_changes = [image_uri]
  }
}

# Public URL, but the handler verifies the Cognito token on every call.
resource "aws_lambda_function_url" "parser" {
  function_name      = aws_lambda_function.parser.function_name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"

  cors {
    allow_origins = [local.site_url, var.local_frontend_url]
    allow_methods = ["POST"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 300
  }
}

# A public function URL needs both grants. Imported with the statement ids
# CloudFormation generated.
resource "aws_lambda_permission" "parser_url" {
  statement_id           = "spry-ai-ParserUrlPermission-2fFiFbaemAiB"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.parser.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "parser_url_invoke" {
  statement_id             = "spry-ai-ParserUrlInvokePermission-I0FDDyuINwFK"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.parser.function_name
  principal                = "*"
  invoked_via_function_url = true
}
