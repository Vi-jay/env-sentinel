# Security

env-sentinel reads env files that usually contain secrets. The `check` command masks every value it prints. `sync` and `init` copy comments and write `KEY=` lines; they do not copy assignment values. If a comment contains a value of 8 or more characters (other than a short denylist of common placeholders and all-digit strings), the write is refused.

That is not a general secret scanner. A short value repeated in a comment can still be copied, because comments are kept on purpose. Do not put real secrets in comments.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability, and do not paste real `.env` contents into a report.

Email the maintainer through the address published on the [GitHub profile for Vi-jay](https://github.com/Vi-jay) with:

- a description of the problem
- a minimal example that uses fake secrets
- the version or commit you ran

There is no bug bounty. You should hear back within a week.
