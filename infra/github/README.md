# GitHub settings as code

The layout and the reusable Plan, Apply, fmt, seed and state-backup workflows
follow [formicarium](https://github.com/aletheia-works/formicarium/tree/main/infra/github).
OpenTofu manages the repository, its labels, the `release` environment and
the `main` ruleset. Import blocks adopt the repository and its default labels
from an empty state.

## Required checks

| Exact check name     | Coverage                                                          |
| -------------------- | ----------------------------------------------------------------- |
| `ci-required`        | Lint, the Playwright tests in three browsers and the packed files |
| `check / Commitlint` | The organisation's reusable commitlint workflow                   |

Both are bound to GitHub Actions app ID `15368`.

## The `release` environment

`publish.yml` publishes to npm from the `release` environment, which only
`v*` tags may deploy to. npm's trusted publisher names repository
`aletheia-works/coi-serviceworker`, workflow `publish.yml` and environment
`release`. JSR publishes through the GitHub repository linked in the
package's settings on jsr.io.

## Secrets

The workflows use the organisation secrets `TF_TOKEN_GITHUB`,
`TF_STATE_PASSPHRASE`, `BOT_PRIVATE_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` and the
variable `BOT_CLIENT_ID`. `TF_TOKEN_GITHUB` is a fine-grained token: its
repository access must include this repository, with Read and write on
Administration, Actions, Contents, Issues, Pull requests and Variables.

State is the encrypted Actions artifact `terraform-state`, located by the
variable `LATEST_APPLY_RUN_ID`, as in formicarium. If it is lost, import the
live resources again rather than apply from nothing.

## Local verification

```sh
tofu -chdir=infra/github init -backend=false
tofu -chdir=infra/github fmt -check -recursive
tofu -chdir=infra/github validate
```
