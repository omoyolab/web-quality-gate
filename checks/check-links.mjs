#!/usr/bin/env node
/**
 * check-links: every internal link and asset in a static build points at a file that exists.
 *
 * Checks href and src values that are site-relative ("/posts/a/") or relative
 * ("../img.png"). External links are not fetched: this stays fast and offline.
 *
 * Usage: node check-links.mjs [dist]
 * Exit code 1 if any link is broken. Zero dependencies.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// "/posts/a/" can be served by posts/a/index.html, posts/a.html or the file itself.
const exists = (target) => {
  const clean = decodeURIComponent(target.split(/[?#]/)[0]);
  if (!clean) return true;
  const candidates = [clean, join(clean, 'index.html'), `${clean.replace(/\/$/, '')}.html`];
  return candidates.some((c) => existsSync(c) && (statSync(c).isFile() || existsSync(join(c, 'index.html'))));
};

const broken = [];
let count = 0;
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  for (const [, , value] of html.matchAll(/\s(href|src)\s*=\s*["']([^"']+)["']/gi)) {
    if (/^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(value)) continue;
    count++;
    const target = value.startsWith('/') ? join(dist, value) : resolve(dirname(file), value);
    if (!exists(target)) broken.push(`${relative(dist, file)} → ${value}`);
  }
}

if (broken.length) {
  console.error(`check-links: ${broken.length} broken internal link(s)\n`);
  for (const b of [...new Set(broken)]) console.error(`  ✘ ${b}`);
  process.exit(1);
}
console.log(`check-links: ${count} internal links and assets resolve`);
