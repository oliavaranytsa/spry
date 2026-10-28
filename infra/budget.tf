# The $5 monthly budget alarm from Lab 6. It was created by a script with the
# AWS CLI (deploy-ai.sh), so no template described it: exactly the "made by
# hand, written down nowhere" resource of Part 0. Now it is written down.
#
# Not adopted: "My Zero-Spend Budget", made by hand in the console when the
# account was new. Terraform does not know it exists, and that is a choice.

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project_name}-monthly"
  budget_type  = "COST"
  time_unit    = "MONTHLY"
  limit_amount = var.budget_limit_usd
  limit_unit   = "USD"

  notification {
    notification_type          = "ACTUAL"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.budget_email]
  }

  notification {
    notification_type          = "FORECASTED"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.budget_email]
  }
}
