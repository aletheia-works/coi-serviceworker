# AGENTS.md

Standing instructions for AI coding agents in this repository.

## What this is

`@aletheia-works/coi-serviceworker` is one script, `coi-serviceworker.js`,
that makes a page on a static host cross-origin isolated through a service
worker. [aletheia-works/vivarium](https://github.com/aletheia-works/vivarium)
uses it for its in-browser reproductions.

## Rules

- Use Jujutsu (`jj`), not Git. Quote `@` in PowerShell (`jj log -r '@'`).
- Conventional Commits, with a subject that starts with a lowercase letter.
- Correctness claims need observed evidence: a command and its output, a test
  name, or a log line. Mark anything unverified as unverified.
- A behaviour fix starts with a Playwright test that fails before the fix, in
  `tests/coi.spec.mts`. The spec is `.mts` because Bun parses a `.ts` spec as
  plain JavaScript under Playwright's loader (oven-sh/bun#47175).
- Run everything on Bun, not Node. `bunfig.toml` covers `bun run`; `bunx` needs
  `--bun`. Publishing to npm is the one exception, as Bun cannot publish over
  OIDC (oven-sh/bun#15601).
- Keep the package one dependency-free script. Do not add options for needs
  no user has.
- Pin GitHub Actions by full commit SHA with the version as a trailing
  comment. The organisation's reusable workflows carry their `vX.Y.Z` tag.
- No comments except ones the file needs to work, or a short why that the
  code cannot show.
- Never create accounts, handle credentials or publish by hand. Repository
  settings change only through `infra/github`.

## Before a pull request

```sh
mise run check
mise run test
```
