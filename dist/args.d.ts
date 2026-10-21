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
    discover: string[];
    discoverSet: boolean;
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
export declare function parseArgs(argv: string[]): {
    ok: true;
    args: Args;
} | {
    ok: false;
    message: string;
};
export declare const HELP = "env-sentinel \u2014 validate .env files against .env.example\n\nUsage:\n  env-sentinel check [options]\n  env-sentinel sync [options]\n  env-sentinel init [options]\n\nCommands:\n  check    Validate env files (default)\n  sync     Update the example file from env files, with values removed\n  init     Create the example file if it does not exist\n\nOptions:\n  -e, --env <path>       Env file. Repeatable, or comma-separated. Default: .env\n  -x, --example <path>   Example file. Default: .env.example\n      --schema <path>    JSON schema, or another dotenv file. Merged over the example\n      --discover <glob>  Find .env and .env.example pairs. Repeatable (check)\n      --strict           Turn undocumented keys into errors (check)\n      --no-strict        Leave undocumented keys as warnings\n  -f, --format <name>    human (default) or json (check)\n      --prune            Drop example keys that are not in the env file (sync)\n      --dry-run          Print the example, do not write (sync, init)\n      --quiet            Print nothing when check succeeds\n      --config <path>    Config file. Default: env-sentinel.config.json\n      --no-config        Ignore the config file\n      --color            Force color\n      --no-color         Disable color\n  -h, --help             Show this help\n  -v, --version          Show the version\n\nExit codes:\n  0  No errors\n  1  Validation errors\n  2  Usage error, unreadable file, or sync refused to write\n\nValues are masked in every report. sync and init never copy assignment values.\n";
//# sourceMappingURL=args.d.ts.map