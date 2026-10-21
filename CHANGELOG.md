# Changelog

## Unreleased

- `--format github` prints GitHub Actions annotations for each finding, using the finding's file and line, then the human report. The composite action defaults to that format. Values stay masked.

## 0.1.0 - 2026-10-21

Initial release.

- `check` compares one or more env files with `.env.example` or a JSON schema.
- Reports missing keys, empty required values, undocumented keys, duplicate keys, malformed lines, unclosed quotes, and type mismatches.
- Comment annotations: `@type` (`string`, `url`, `int`, `bool`, `email`, `port`, `enum(...)`), `@optional`, and `@required`.
- Human and JSON output. Values are masked. `--strict` turns undocumented keys into errors.
- `sync` and `init` write example files with assignment values removed.
- Pre-commit hook and a composite GitHub Action.
