/**
 * The two flags that must work on an unconfigured machine.
 *
 * `--version` and `--help` are what a person tries first, and both used to
 * fall through to the stdio branch and exit 1 demanding `CHATLY_API_KEY`.
 * `scripts/publish-packages.mjs` also runs every published `bin` with
 * `--version` to verify a release, so that failure reported a good package as
 * broken.
 *
 * These assert the PURE helper rather than spawning `dist/main.js`, so they
 * run with no build step — but note that the thing the publish verifier
 * executes is the built binary, and `ownVersion` is the part that can differ
 * between the two (it resolves `../package.json` from its own module URL).
 * `pnpm --filter @chatlychat/mcp exec node dist/main.js --version` is the
 * end-to-end check, and it is what was run by hand when this landed.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { earlyExitOutput, ownVersion } from './cli-flags.js';

describe('early-exit flags', () => {
  it('reports the version from the manifest, not a hardcoded string', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(ownVersion()).toBe(pkg.version);
    // A real semver, so a misresolved path cannot pass as the '0.0.0' fallback.
    expect(ownVersion()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ownVersion()).not.toBe('0.0.0');
  });

  it('answers --version and -v', () => {
    expect(earlyExitOutput(['--version'])).toBe(ownVersion());
    expect(earlyExitOutput(['-v'])).toBe(ownVersion());
  });

  it('answers --help and -h with something that names the env var', () => {
    const help = earlyExitOutput(['--help']);
    expect(help).not.toBeNull();
    expect(help).toContain('CHATLY_API_KEY');
    expect(help).toContain('--http');
    expect(earlyExitOutput(['-h'])).toBe(help);
  });

  it('does NOT intercept a normal boot, or --http', () => {
    expect(earlyExitOutput([])).toBeNull();
    expect(earlyExitOutput(['--http'])).toBeNull();
    // The flag has to be asked for, not merely resemble something.
    expect(earlyExitOutput(['--versionish'])).toBeNull();
  });

  it('prefers --version over --help when both are passed', () => {
    expect(earlyExitOutput(['--help', '--version'])).toBe(ownVersion());
  });
});
