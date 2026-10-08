#!/usr/bin/env node
/**
 * check-pages: deterministic checks on every HTML page in a static build.
 *
 * Lighthouse tests a handful of URLs. This walks the whole output folder and
 * checks the things that should be true on every page and never fluctuate.
 *
 * Usage: node check-pages.mjs [dist] [--min-text=200] [--max-image-kb=300]
 * Exit code 1 if any page fails. Zero dependencies.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith('--')) ?? 'dist';
const opt = (name, fallback) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const MIN_TEXT = opt('min-text', 200);
const MAX_IMAGE_KB = opt('max-image-kb', 300);
// Pages that are allowed to be thin or unindexed.
const EXEMPT = /(^|\/)(404|500)\.html$|(^|\/)404\/index\.html$/;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = walk(dist);
const pages = files.filter((f) => f.endsWith('.html'));
const problems = [];
const notes = [];
const titles = new Map();
const referenced = new Set();
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
// Remember every image a page can load: src, srcset, links (lightboxes), og:image, data-* attributes.
const collectRefs = (file, html) => {
  for (const [, value] of html.matchAll(/(?:src|href|content|data-[\w-]+)\s*=\s*["']([^"']+)["']/gi)) collect(file, value);
  for (const [, set] of html.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) for (const part of set.split(',')) collect(file, part.trim().split(/\s+/)[0]);
};
const collect = (file, url) => {
  if (!url || /^(data:|mailto:|tel:)/i.test(url)) return;
  let path = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  if (!IMAGE.test(path)) return;
  referenced.add(resolve(path.startsWith('/') ? join(dist, path) : resolve(dirname(file), path)));
};
const fail = (file, msg) => problems.push(`${relative(dist, file)}: ${msg}`);

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))?.slice(2).find((v) => v !== undefined);

for (const file of pages) {
  if (EXEMPT.test(relative(dist, file))) { collectRefs(file, readFileSync(file, 'utf8')); continue; }
  const html = readFileSync(file, 'utf8');
  collectRefs(file, html);
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';

  // Content that exists before JavaScript runs. An empty shell may never be indexed.
  const text = html
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < MIN_TEXT) fail(file, `only ${text.length} characters of text in the HTML (minimum ${MIN_TEXT}); is the content rendered by JavaScript only?`);

  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title) fail(file, 'missing <title>');
  else titles.set(title, [...(titles.get(title) ?? []), relative(dist, file)]);

  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const description = metas.find((m) => /name\s*=\s*["']description["']/i.test(m));
  if (!description || !attr(description, 'content')?.trim()) fail(file, 'missing meta description');

  if (!/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(head)) fail(file, 'missing canonical link');
  if (!/<html\b[^>]*\slang\s*=\s*["'][^"']+["']/i.test(html)) fail(file, 'missing lang attribute on <html>');
  if (metas.some((m) => /name\s*=\s*["']robots["']/i.test(m) && /noindex/i.test(m))) fail(file, 'page is marked noindex');

  for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = attr(img, 'src');
    // An <img> with no src is a placeholder filled in by JavaScript (a lightbox, say); it loads nothing.
    if (!src) continue;
    if (attr(img, 'alt') === undefined) fail(file, `image without alt attribute: ${src}`);
    if (!attr(img, 'width') || !attr(img, 'height')) fail(file, `image without width and height (causes layout shift): ${src}`);
  }
}

for (const [title, where] of titles) {
  if (where.length > 1) problems.push(`duplicate <title> "${title}" on ${where.length} pages: ${where.slice(0, 3).join(', ')}${where.length > 3 ? ', ...' : ''}`);
}

// Image weight, for images a page actually loads. Bytes do not fluctuate, so this is safe to block on.
// Images nothing references are only reported: they cost deploy size, not visitors' data.
for (const f of files.filter((f) => IMAGE.test(f))) {
  const kb = statSync(f).size / 1024;
  if (referenced.has(resolve(f))) {
    if (kb > MAX_IMAGE_KB) problems.push(`${relative(dist, f)}: image is ${Math.round(kb)} KB (limit ${MAX_IMAGE_KB} KB)`);
  } else if (kb > 50) {
    notes.push(`${relative(dist, f)}: ${Math.round(kb)} KB, not used by any page`);
  }
}

const checked = pages.filter((f) => !EXEMPT.test(relative(dist, f))).length;
if (notes.length) {
  console.log(`check-pages: ${notes.length} unused image(s) in the build (not a failure)`);
  for (const n of notes) console.log(`  · ${n}`);
}
if (problems.length) {
  console.error(`check-pages: ${problems.length} problem(s) in ${checked} pages\n`);
  for (const p of problems) console.error(`  ✘ ${p}`);
  process.exit(1);
}
console.log(`check-pages: ${checked} pages passed (text, title, description, canonical, lang, images)`);
