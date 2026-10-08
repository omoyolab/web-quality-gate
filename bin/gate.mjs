#!/usr/bin/env node
/**
 * web-quality-gate: run every check against a built static site.
 *
 *   npx web-quality-gate [dist] [--no-lighthouse] [--no-canonical] [--min-text=200] [--max-image-kb=300]
 *
 * 1. check-pages: every HTML page has text, a title, a description, a canonical URL, lang,
 *    and images with alt text and dimensions; images it loads stay under a size limit.
 * 2. check-links: every internal link and asset resolves.
 * 3. Lighthouse CI: byte budgets, SEO and accessibility audits block; performance scores warn.
 *
 * Exits 1 if anything that blocks fails.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith('--')) ?? 'dist';
const passThrough = args.filter((a) => a.startsWith('--min-text=') || a.startsWith('--max-image-kb=') || a === '--no-canonical');
const lighthouse = !args.includes('--no-lighthouse');

if (!existsSync(dist)) {
  console.error(`web-quality-gate: "${dist}" does not exist. Build the site first.`);
  process.exit(2);
}

const run = (label, cmd, cmdArgs) => {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
  return r.status === 0;
};

const results = [
  run('Pages', process.execPath, [join(root, 'checks/check-pages.mjs'), dist, ...passThrough]),
  run('Links', process.execPath, [join(root, 'checks/check-links.mjs'), dist]),
];
if (lighthouse) {
  // A project's own lighthouserc.json wins; otherwise use the defaults shipped here.
  const config = existsSync('lighthouserc.json') ? 'lighthouserc.json' : join(root, 'lighthouserc.json');
  results.push(
    run('Lighthouse', 'npx', ['-y', '@lhci/cli@0.14.0', 'autorun', `--config=${config}`, `--collect.staticDistDir=${dist}`]),
  );
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n✘ web-quality-gate: ${failed} check(s) failed` : '\n✔ web-quality-gate: all checks passed');
process.exit(failed ? 1 : 0);
