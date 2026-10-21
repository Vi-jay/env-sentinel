# env-sentinel

Validate `.env` files against `.env.example` (or a JSON schema) before they break production. Use it locally, in a pre-commit hook, and in CI.

A missing key, an empty required value, a typo such as `DATABSE_URL`, or a broken line usually shows up only when the app boots. env-sentinel checks the contract first. Reports mask values. `sync` and `init` never copy assignment values into the example file.

[![CI](https://github.com/Vi-jay/env-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/Vi-jay/env-sentinel/actions/workflows/ci.yml)

## Install

The package name is `@vi-jay/env-sentinel`. The command it installs is `env-sentinel`. Node.js 18 or newer is required. There are no runtime dependencies. The library is ESM-only.

The unscoped npm name `env-sentinel` is a different project. `npx env-sentinel` without a local install runs that other package. After this package is installed in a project, `npx env-sentinel` runs the local binary.

This repository is the source. Publish target:

```bash
npm install --save-dev @vi-jay/env-sentinel
npx env-sentinel check
```

Until that publish exists, install from GitHub:

```bash
npm install --save-dev github:Vi-jay/env-sentinel
npx env-sentinel check
```

From a checkout:

```bash
npm install
npm test
node dist/cli.js check --env examples/app/.env --example examples/app/.env.example
```

## Quick start

`examples/app/.env.example` declares the contract. Annotations sit in comments:

```dotenv
# Public base URL
# @type url
APP_URL=https://localhost:3000

# @type port
PORT=3000

# @type enum(development,test,production)
NODE_ENV=development

# @optional @type email
ALERT_EMAIL=
```

Check the env file:

```bash
npx env-sentinel check --env .env --example .env.example
```

This is the real report for `examples/broken/.env` (the file contains a fake token; the report does not print it):

```text
env-sentinel

examples/broken/.env
  error    type-mismatch  APP_URL           Expected a URL with a scheme, such as https:// or postgres://. Value masked
  error    empty          PORT              Required value is empty
  error    type-mismatch  NODE_ENV          Expected one of: development, test, production. Value masked
  warning  extra          EXTRA_TOKEN       Not documented in examples/broken/.env.example
  error    duplicate      WORKERS           WORKERS is duplicated (first defined on line 5, again on line 6). The last value wins.
  error    malformed      THIS              Line 7: expected KEY=VALUE
  error    missing        DATABASE_URL      Required key is missing (declared in examples/broken/.env.example:2)

6 errors, 1 warning
```

Exit code is `1`. `--strict` turns the extra-key warning into an error. `--format json` prints the same findings as JSON, still with masked values.

Create or refresh the example file from a real env file. Values are removed:

```bash
npx env-sentinel init
npx env-sentinel sync
```

```dotenv
# database
DATABASE_URL=postgres://user:secret@localhost/db

PORT=3000
```

becomes:

```dotenv
# database
DATABASE_URL=

PORT=
```

## What check reports

| Code | Meaning | Default severity |
| --- | --- | --- |
| `missing` | A required key is absent | error |
| `empty` | A required value is empty or whitespace | error |
| `type-mismatch` | The value does not match `@type` | error |
| `duplicate` | The same key is assigned again. The last value wins | error |
| `malformed` | The line is not `KEY=VALUE`, or junk follows a quoted value | error |
| `unclosed-quote` | A quoted value never closes | error |
| `unknown-type` | `@type` or a schema type is not one of the types below | error |
| `schema-invalid` | The JSON schema is not usable | error, or warning for an unknown field |
| `extra` | The key is not in the example or schema | warning, or error with `--strict` |
| `file-not-found` | A path does not exist | error, exit code 2 |
| `unreadable` | A path is not a readable file | error, exit code 2 |

Keys are required unless marked optional. Each `--env` file is checked on its own against the same contract. `.env.production` should be a complete file. A partial overlay such as `.env.local` reports every required key it does not repeat.

A value that contains `$NAME` or `${NAME}` is not type-checked. The variable is not expanded. An empty required value is still an error.

## Annotations

Put markers in the comment lines directly above a key, or in an inline comment. A blank line ends the comment block. Later markers win.

```dotenv
# @type url
DATABASE_URL=

# @optional @type email
ALERT_EMAIL=

LOG_LEVEL=info # @type enum(debug, info, warn, error)
```

| Marker | Effect |
| --- | --- |
| `@type <type>` | Validate the value |
| `@optional` | The key may be absent or empty |
| `@required` | The key must be non-empty. This is the default |

Prose in those comments is kept as the description on the parsed schema. It is not printed by `check`.

### Types

| Type | Accepts |
| --- | --- |
| `string` | Any non-empty value when the key is required |
| `url` | An absolute URL with a hostname, or a `mailto:` / `file:` URL |
| `int` | An integer with an optional sign, no leading zeros (`0`, `-3`, `42`). Must be a safe integer |
| `bool` | `true`, `false`, `yes`, `no`, `on`, `off`, `1`, `0`. Case-insensitive |
| `email` | A practical `local@domain.tld` check, not the full RFC. At most 254 characters |
| `port` | An integer from 1 to 65535 with no leading zeros |
| `enum(a,b)` | One of the listed values, case-sensitive. Spaces around commas are ignored. Quote a value to keep surrounding spaces |

Unknown type names are schema errors.

## JSON schema

`--schema` points at a JSON file, or at another dotenv file. A `.json` file uses this shape. `variables` may be an object or an array.

```json
{
  "variables": {
    "APP_URL": { "type": "url", "required": true, "description": "Public base URL" },
    "PORT": { "type": "port", "required": true },
    "NODE_ENV": { "type": "enum", "values": ["development", "test", "production"] },
    "ALERT_EMAIL": { "type": "email", "optional": true }
  }
}
```

`type` may also be written as `"enum(debug,info)"`. `values` is only used with `enum`. `$schema` is ignored. Any other root or variable field produces a warning.

When both `--example` and `--schema` are set, the example supplies the key list and comment annotations. The JSON schema overrides type, required, and description on keys it names, and it can add keys. See `examples/schema/`.

## CLI

```text
env-sentinel check [options]
env-sentinel sync [options]
env-sentinel init [options]
```

`check` is the default when the first argument is a flag.

| Flag | Commands | Meaning |
| --- | --- | --- |
| `-e, --env <path>` | all | Env file. Repeat the flag, or separate paths with commas. Default: `.env` |
| `-x, --example <path>` | all | Example file. Default: `.env.example` |
| `--schema <path>` | check | JSON schema, or another dotenv file |
| `--strict` / `--no-strict` | check | Undocumented keys are errors, or warnings |
| `-f, --format <human\|json>` | check | Default: `human` |
| `--quiet` | check | Print nothing when the human report has no errors |
| `--prune` | sync | Remove example keys that are not in the env file, including the comments attached to them |
| `--dry-run` | sync, init | Print the example on stdout. Do not write |
| `--config <path>` | all | Config file. Default: `env-sentinel.config.json` in the working directory |
| `--no-config` | all | Ignore the config file |
| `--color` / `--no-color` | check | Color is on when stdout is a terminal. `NO_COLOR` disables it. JSON is never colored |
| `-h, --help` | | Help |
| `-v, --version` | | Version |

Flags override the config file. Paths in a config file are relative to that file. Paths on the command line are relative to the working directory.

### Config file

```json
{
  "env": [".env", ".env.local"],
  "example": ".env.example",
  "schema": "env.schema.json",
  "strict": false,
  "format": "human"
}
```

`env` may be a string or an array. Unknown fields are an error.

### Exit codes

| Code | When |
| --- | --- |
| 0 | No errors. Warnings are allowed unless `--strict` promotes them |
| 1 | Validation errors |
| 2 | Bad usage, a missing or unreadable file, or `sync`/`init` refused to write |

### JSON output

`--format json` writes one object to stdout. `maskedValue` is `****` or `(empty)`. `valueLength` is the character count. The raw value is not a field.

A passing check of `examples/app/.env` looks like this:

```json
{
  "version": "0.1.0",
  "ok": true,
  "strict": false,
  "summary": {
    "errors": 0,
    "warnings": 0
  },
  "files": [
    {
      "path": "examples/app/.env",
      "role": "env",
      "ok": true,
      "checked": 5,
      "findings": []
    }
  ]
}
```

## sync and init

Both commands read one or more env files and write the example file with LF line endings.

- Assignment values are never copied. A quoted or multiline value is replaced with `KEY=`.
- Comments and blank lines from the first env file are kept. `export` and indentation are kept.
- Malformed lines are omitted, so a broken line cannot carry a secret into the example.
- A duplicated key is written once, from the first occurrence.
- Later `--env` files only add keys that are not already present.
- `init` fails if the example file already exists.
- `sync` creates the file when it is missing. When it exists, existing lines are left alone, including placeholder values, and new keys are appended under `# --- synced from .env (values omitted) ---`.
- `--prune` deletes example keys that are absent from the env files.
- The write is atomic: a temp file in the same directory is renamed into place.
- If a generated comment contains an env value of 8 or more characters, the write is refused and nothing is written. All-digit values are ignored, as are these exact placeholders: `true`, `false`, `yes`, `no`, `development`, `production`, `test`, `staging`, `localhost`, `changeme`, `placeholder`, `example`, `postgres`, `mysql`, `redis`, `mongodb`, `password`, `secret`. Shorter values repeated in a comment are not detected. Do not put secrets in comments.

`parseEnv` returns real values. Do not log a parse result. Use `maskSecret` or the check report.

## Library

```ts
import { check, formatReport, sync } from '@vi-jay/env-sentinel';

const report = check({
  envPaths: ['.env', '.env.production'],
  examplePath: '.env.example',
  strict: true,
});

process.stdout.write(formatReport(report, { format: 'human', color: false, version: '0.1.0' }));
if (!report.ok) process.exitCode = 1;

const written = sync({
  envPaths: ['.env'],
  examplePath: '.env.example',
  command: 'sync',
});
```

Also exported: `checkContents`, `parseEnv`, `loadSchemaFromContents`, `mergeSchemas`, `renderExample`, `maskSecret`, and the result types.

## Pre-commit

`.pre-commit-hooks.yaml` defines the hook. The hook runs `env-sentinel check` and does not pass filenames through, because a staged file is not always the file you want to validate.

```yaml
repos:
  - repo: https://github.com/Vi-jay/env-sentinel
    rev: v0.1.0
    hooks:
      - id: env-sentinel
```

`language: node` installs this repository and runs the `env-sentinel` binary, which points at `dist/cli.js`. The hook's `files` pattern is `\.env`, so it runs when an env file or `.env.example` is part of the commit. Many projects gitignore `.env`. The useful local trigger is then a change to `.env.example`. CI, below, is where the real env file is checked.

Add `--strict` by overriding `args`:

```yaml
- id: env-sentinel
  args: [--strict]
```

## GitHub Action

`action.yml` is a composite action. It runs the committed `dist/cli.js` with Node 22. Inputs are passed as environment variables, not interpolated into the shell.

```yaml
- uses: actions/checkout@v7
- uses: Vi-jay/env-sentinel@v0.1.0
  with:
    env-file: .env
    example-file: .env.example
    strict: true
```

| Input | Default | Purpose |
| --- | --- | --- |
| `env-file` | `.env` | One path, or a comma-separated list |
| `example-file` | `.env.example` | Set to an empty string to use `schema-file` alone |
| `schema-file` | empty | JSON schema or another dotenv file |
| `strict` | `false` | `true` fails on undocumented keys |
| `format` | `human` | `human` or `json` |
| `working-directory` | `.` | Where the files live |

Create the env file in an earlier step if it comes from CI secrets. The action does not print those values.

## Parsing

The parser accepts what shows up in real env files:

- `KEY=value` with spaces around `=`
- a leading `export`
- single quotes, double quotes, and backticks
- multiline quoted values
- `#` comments, and an inline comment only when whitespace precedes `#` in an unquoted value
- double-quote escapes: `\n`, `\r`, `\t`, `\\`, `\"`, `\'`, `` \` ``, `\$`, `\uXXXX`
- single-quote escapes: `\\` and `\'` only
- CRLF, lone CR, and a leading UTF-8 BOM

Keys match `[A-Za-z_][A-Za-z0-9_]*`. A `:` separator is not an assignment. Unquoted values are trimmed. The last assignment wins, and the duplicate is reported.

## Development

```bash
npm install
npm test
npm run lint
```

`npm test` compiles TypeScript and runs Node's test runner. CI on GitHub runs lint and tests on Node 18, 20, and 22, then rebuilds `dist/` and fails if it drifted. The Action smoke job runs `action.yml` against `examples/app`.

Commit `dist/` after a source change. The Action and the pre-commit hook run that build rather than compiling on install.

See [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Vi-jay
