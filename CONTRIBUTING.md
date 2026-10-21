# Contributing

Issues and pull requests are welcome. Please keep changes focused, and do not include real secrets in fixtures, issues, or screenshots.

## Setup

Node.js 18 or newer is required.

```bash
npm install
npm test
npm run lint
```

`npm test` compiles `src/` to `dist/` and the tests to `dist-test/`, then runs Node's built-in test runner. The published CLI is `dist/cli.js`. After you change source, run `npm run build` and commit the updated `dist/` files. CI rebuilds and fails if `dist/` is stale.

Try the CLI from a checkout:

```bash
node dist/cli.js check --env examples/app/.env --example examples/app/.env.example
```

## Pull requests

- Add or update tests for parser, check, and sync behavior.
- Keep README examples identical to the commands and output the tool actually produces.
- Do not add runtime dependencies. Dev dependencies are fine.
- Run `npm test` and `npm run lint` before pushing.

## Code of conduct

Be respectful in reviews and issues. Assume good intent, and keep feedback about the code.
