# What this configuration reads but does not own.

data "aws_caller_identity" "current" {}

# The course-template stacks, still in CloudFormation.
data "aws_cloudformation_stack" "frontend" {
  name = "${var.project_name}-frontend"
}

# The API function: the report builder runs the same image, in the same
# network, against the same database.
data "aws_lambda_function" "backend" {
  function_name = "${var.project_name}-backend"
}

# Every route table of the API's VPC gets the S3 gateway endpoint: default-VPC
# subnets usually use the VPC's main table.
data "aws_route_tables" "vpc" {
  vpc_id = data.aws_lambda_function.backend.vpc_config[0].vpc_id
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  site_url   = trimsuffix(data.aws_cloudformation_stack.frontend.outputs["SiteUrl"], "/")

  backend_image = data.aws_lambda_function.backend.image_uri
  backend_arch  = data.aws_lambda_function.backend.architectures[0]
  backend_vpc   = data.aws_lambda_function.backend.vpc_config[0]

  # Holds the database password. It is in the state (as it was in the old
  # stack's parameters), never in a file or a plan.
  database_url = sensitive(data.aws_lambda_function.backend.environment[0].variables["DATABASE_URL"])
}
