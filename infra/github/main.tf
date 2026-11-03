resource "github_repository" "this" {
  name                        = var.repository_name
  description                 = "Cross-origin isolation for static hosts through a service worker that reloads only once it controls the page."
  homepage_url                = "https://www.npmjs.com/package/@aletheia-works/coi-serviceworker"
  topics                      = ["coep", "coop", "cross-origin-isolation", "github-pages", "service-worker", "sharedarraybuffer"]
  visibility                  = "public"
  has_issues                  = true
  has_discussions             = false
  has_projects                = false
  has_wiki                    = false
  allow_merge_commit          = false
  allow_squash_merge          = true
  allow_rebase_merge          = false
  allow_auto_merge            = true
  delete_branch_on_merge      = true
  web_commit_signoff_required = true
  archived                    = false
  lifecycle {
    prevent_destroy = true
  }
}
import {
  to = github_repository.this
  id = var.repository_name
}

resource "github_repository_vulnerability_alerts" "this" {
  repository = github_repository.this.name
}

resource "github_repository_environment" "release" {
  repository  = github_repository.this.name
  environment = "release"

  can_admins_bypass = false

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}
resource "github_repository_environment_deployment_policy" "release_tags" {
  repository  = github_repository.this.name
  environment = github_repository_environment.release.environment
  tag_pattern = "v*"
}

locals {
  required_checks = ["ci-required", "check / Commitlint"]
}
resource "github_repository_ruleset" "main" {
  name        = "main"
  repository  = github_repository.this.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    deletion                = true
    non_fast_forward        = true
    required_linear_history = true
    required_signatures     = true

    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = true
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = true
    }

    required_status_checks {
      strict_required_status_checks_policy = false

      dynamic "required_check" {
        for_each = local.required_checks

        content {
          context        = required_check.value
          integration_id = 15368
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
