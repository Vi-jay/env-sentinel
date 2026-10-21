# Changelog

## Unreleased

- `--discover` finds `.env` / `.env.example` pairs (including `.env.<name>` / `.env.<name>.example`) under globbed directories and checks each pair on its own. `**` walks nested directories. `node_modules` and `.git` are skipped.

## 0.1.0 - 2026-10-21

Initial release.

- `check` compares one or more env files with `.env.example` or a JSON schema.
- Reports missing keys, empty required values, undocumented keys, duplicate keys, malformed lines, unclosed quotes, and type mismatches.
- Comment annotations: `@type` (`string`, `url`, `int`, `bool`, `email`, `port`, `enum(...)`), `@optional`, and `@required`.
- Human and JSON output. Values are masked. `--strict` turns undocumented keys into errors.
- `sync` and `init` write example files with assignment values removed.
- Pre-commit hook and a composite GitHub Action.
