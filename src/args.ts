export type CommandName = 'check' | 'sync' | 'init' | 'help' | 'version';

export interface Args {
  command: CommandName;
  env: string[];
  envSet: boolean;
  example?: string;
  exampleSet: boolean;
  schema?: string;
  schemaSet: boolean;
  strict: boolean;
  strictSet: boolean;
  format?: 'human' | 'json';
  prune: boolean;
  dryRun: boolean;
  config?: string;
  noConfig: boolean;
  /** Undefined means automatic. */
  color?: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

const COMMANDS = new Set<CommandName>(['check', 'sync', 'init', 'help', 'version']);

export function parseArgs(argv: string[]): { ok: true; args: Args } | { ok: false; message: string } {
  let command: CommandName = 'check';
  let index = 0;
  const head = argv[0];
  if (head && !head.startsWith('-')) {
    if (!COMMANDS.has(head as CommandName)) {
      return { ok: false, message: `Unknown command "${head}". Expected check, sync, or init.` };
    }
    command = head as CommandName;
    index = 1;
  }

  const args: Args = {
    command,
    env: [],
    envSet: false,
    exampleSet: false,
    schemaSet: false,
    strict: false,
    strictSet: false,
    prune: false,
    dryRun: false,
    noConfig: false,
    quiet: false,
    help: command === 'help',
    version: command === 'version',
  };

  while (index < argv.length) {
    const token = argv[index] ?? '';
    if (token === '--') {
      index += 1;
      break;
    }
    if (!token.startsWith('-')) {
      return { ok: false, message: `Unexpected argument "${token}"` };
    }
    const eq = token.indexOf('=');
    const flag = eq === -1 ? token : token.slice(0, eq);
    const inline = eq === -1 ? undefined : token.slice(eq + 1);

    switch (flag) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-v':
      case '--version':
        args.version = true;
        break;
      case '--strict':
        args.strict = true;
        args.strictSet = true;
        break;
      case '--no-strict':
        args.strict = false;
        args.strictSet = true;
        break;
      case '--prune':
        args.prune = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--quiet':
        args.quiet = true;
        break;
      case '--no-config':
        args.noConfig = true;
        break;
      case '--color':
        args.color = true;
        break;
      case '--no-color':
        args.color = false;
        break;
      case '-e':
      case '--env': {
        const value = takeValue(argv, index, inline, flag);
        if (!value.ok) return value;
        const parts = splitList(value.value);
        if (!parts) return { ok: false, message: `${flag} needs a file path` };
        args.env.push(...parts);
        args.envSet = true;
        index = value.next - 1;
        break;
      }
      case '-x':
      case '--example': {
        const value = takeValue(argv, index, inline, flag);
        if (!value.ok) return value;
        if (value.value.length === 0) return { ok: false, message: `${flag} needs a file path` };
        args.example = value.value;
        args.exampleSet = true;
        index = value.next - 1;
        break;
      }
      case '--schema': {
        const value = takeValue(argv, index, inline, flag);
        if (!value.ok) return value;
        if (value.value.length === 0) return { ok: false, message: '--schema needs a file path' };
        args.schema = value.value;
        args.schemaSet = true;
        index = value.next - 1;
        break;
      }
      case '-f':
      case '--format': {
        const value = takeValue(argv, index, inline, flag);
        if (!value.ok) return value;
        if (value.value !== 'human' && value.value !== 'json') {
          return { ok: false, message: '--format must be human or json' };
        }
        args.format = value.value;
        index = value.next - 1;
        break;
      }
      case '--config': {
        const value = takeValue(argv, index, inline, flag);
        if (!value.ok) return value;
        if (value.value.length === 0) return { ok: false, message: '--config needs a file path' };
        args.config = value.value;
        index = value.next - 1;
        break;
      }
      default:
        return { ok: false, message: `Unknown option "${flag}"` };
    }
    index += 1;
  }

  if (index < argv.length) {
    return { ok: false, message: `Unexpected argument "${argv[index] ?? ''}"` };
  }
  if (args.help || args.version) return { ok: true, args };
  return validateForCommand(args);
}

export const HELP = `env-sentinel — validate .env files against .env.example

Usage:
  env-sentinel check [options]
  env-sentinel sync [options]
  env-sentinel init [options]

Commands:
  check    Validate env files (default)
  sync     Update the example file from env files, with values removed
  init     Create the example file if it does not exist

Options:
  -e, --env <path>       Env file. Repeatable, or comma-separated. Default: .env
  -x, --example <path>   Example file. Default: .env.example
      --schema <path>    JSON schema, or another dotenv file. Merged over the example
      --strict           Turn undocumented keys into errors (check)
      --no-strict        Leave undocumented keys as warnings
  -f, --format <name>    human (default) or json (check)
      --prune            Drop example keys that are not in the env file (sync)
      --dry-run          Print the example, do not write (sync, init)
      --quiet            Print nothing when check succeeds
      --config <path>    Config file. Default: env-sentinel.config.json
      --no-config        Ignore the config file
      --color            Force color
      --no-color         Disable color
  -h, --help             Show this help
  -v, --version          Show the version

Exit codes:
  0  No errors
  1  Validation errors
  2  Usage error, unreadable file, or sync refused to write

Values are masked in every report. sync and init never copy assignment values.
`;

function validateForCommand(args: Args): { ok: true; args: Args } | { ok: false; message: string } {
  if (args.command === 'check') {
    if (args.prune) return { ok: false, message: '--prune is only valid with sync' };
    if (args.dryRun) return { ok: false, message: '--dry-run is only valid with sync or init' };
    return { ok: true, args };
  }
  if (args.format) return { ok: false, message: '--format is only valid with check' };
  if (args.strictSet) return { ok: false, message: '--strict is only valid with check' };
  if (args.quiet) return { ok: false, message: '--quiet is only valid with check' };
  if (args.schemaSet) return { ok: false, message: '--schema is only valid with check' };
  if (args.command === 'init' && args.prune) return { ok: false, message: '--prune is only valid with sync' };
  return { ok: true, args };
}

function splitList(value: string): string[] | null {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : null;
}

function takeValue(
  argv: string[],
  index: number,
  inline: string | undefined,
  flag: string,
): { ok: true; value: string; next: number } | { ok: false; message: string } {
  if (inline !== undefined) return { ok: true, value: inline, next: index + 1 };
  const next = argv[index + 1];
  if (next === undefined || next.startsWith('-')) return { ok: false, message: `${flag} needs a value` };
  return { ok: true, value: next, next: index + 2 };
}
