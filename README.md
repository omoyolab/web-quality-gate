# web-quality-gate

Catch performance, SEO, image and accessibility problems **before** a change lands, not after you open PageSpeed Insights on the live site.

It runs against your built static site (Astro, Next export, Eleventy, Hugo, Vite and others) and blocks only on things that are certain, while reporting things that are measured:

| Blocks the merge | Reported, never blocks |
|---|---|
| Every page has real text in its HTML (not an empty JavaScript shell) | Lighthouse performance score |
| Every page has a title, meta description, canonical URL and `lang` | Largest Contentful Paint and layout shift (lab) |
| No duplicate titles, no pages accidentally marked `noindex` | Images in the build that no page uses |
| Images have alt text and width and height (no layout shift) | |
| Images a page loads stay under a size limit (default 300 KB) | |
| Every internal link and asset resolves | |
| Byte budgets: JavaScript, images and total page weight (Lighthouse) | |
| Lighthouse SEO and accessibility audits: title, description, crawlable, alt text, `lang`, colour contrast | |

Why the split: a Lighthouse performance score moves a few points between runs of the same page. Gate on it and it fails at random, and people learn to ignore it. Bytes, titles and missing alt text never fluctuate.

## In GitHub Actions

```yaml
name: Quality
on: [pull_request, push]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build
      - uses: omoyolab/web-quality-gate@main
        with:
          dist: dist          # your build folder
          max-image-kb: 300   # optional
```

Make the check required in **Settings → Branches** so nothing merges past it.

## As a git hook (solo projects)

No pull requests? Run it before code leaves your machine. A `pre-push` hook fits better than `pre-commit`: building and running a browser check is fine once per push, not on every commit.

```sh
curl -o .git/hooks/pre-push https://raw.githubusercontent.com/omoyolab/web-quality-gate/main/hooks/pre-push
chmod +x .git/hooks/pre-push
```

Or run it any time:

```sh
npm run build && npx github:omoyolab/web-quality-gate dist
```

Options: `--no-lighthouse` (fast: page and link checks only), `--max-image-kb=300`, `--min-text=200`.

## Changing the budgets

Put a `lighthouserc.json` in your project root and it is used instead of the defaults in this repo. Add a `url` list to choose which pages Lighthouse tests; the page and link checks always cover every page.

## What it cannot tell you

These checks run on a simulated device. They catch regressions; they do not prove the site is fast for real people on real phones. For that, use real-user data: the Core Web Vitals report in Google Search Console, or your analytics.

## Requirements

Node 18 or newer, and Chrome for Lighthouse (already installed on GitHub's Ubuntu runners). The page and link checks have no dependencies.

MIT licence.
