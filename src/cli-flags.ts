/**
 * `--version` and `--help`, split out of `main.ts` so they can be tested.
 *
 * `main.ts` runs its server on import — correct for a `bin`, and it means a
 * spec that imports it boots the stdio transport and calls `process.exit(1)`
 * for want of `CHATLY_API_KEY`. That is exactly what happened when these
 * lived there: 35 tests passed and `vitest` still exited 1 on an unhandled
 * `process.exit`. Rather than make the published entry point guard its own
 * execution — a change to the boot path of a binary, for the benefit of a
 * test — the two pure functions moved here.
 */
import { readFileSync } from 'node:fs';

/** This package's own version, read from the manifest beside the bundle. */
export function ownVersion(): string {
  /*
   * `../package.json` resolves correctly from BOTH `src/cli-flags.ts` and the
   * compiled `dist/cli-flags.js`, because `rootDir` is `src` and `outDir` is
   * `dist` — one level down in either case. npm always includes
   * `package.json` in a tarball regardless of `files`, so this cannot be
   * missing from an installed copy.
   */
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version?: unknown;
  };
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}

const HELP = `chatly-mcp — the Chatly MCP server

Usage
  chatly-mcp                 stdio transport (requires CHATLY_API_KEY)
  chatly-mcp --http          Streamable HTTP transport, default port 4010
  chatly-mcp --version       print the version and exit
  chatly-mcp --help          print this and exit

Environment
  CHATLY_API_KEY   your Chatly API key. Required for stdio, ignored for --http,
                   where the caller's own Authorization header is used instead.
  CHATLY_API_URL   defaults to http://localhost:4000
  MCP_HTTP_PORT    implies --http

Docs: https://chatlychat.com/docs/api-mcp`;

/**
 * What `--version` / `--help` should print, or null to carry on booting.
 *
 * ─── WHY THIS RUNS BEFORE THE ENVIRONMENT IS READ ─────────────────────────
 *
 * `--version` used to fall through to the stdio branch, so it exited 1 with
 * "CHATLY_API_KEY is required" — a credential demanded in order to be told a
 * version number. Two things made that worth fixing rather than tolerating.
 *
 * It is wrong on its own terms: `--version` and `--help` are the two flags a
 * person tries first, and both have to work on a machine that has not been
 * configured yet, because finding out how to configure it is what `--help` is
 * FOR.
 *
 * And `scripts/publish-packages.mjs` verifies a release by installing it from
 * the registry and running every `bin` with `--version` — precisely because
 * `@chatlychat/cli@0.1.6` once installed cleanly and died on startup. With
 * `--version` exiting 1, that verifier reports "INSTALLS BUT DOES NOT RUN"
 * and fails the publish for a package that is in fact fine. A false alarm
 * there is expensive: this script's own comments record three separate
 * occasions when it cried wolf and the next step was to re-publish something
 * that had already worked.
 *
 * Returned rather than printed so it can be tested without spawning a
 * process; `main` does the writing.
 */
export function earlyExitOutput(argv: readonly string[]): string | null {
  if (argv.includes('--version') || argv.includes('-v')) {
    return ownVersion();
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    return HELP;
  }
  return null;
}
