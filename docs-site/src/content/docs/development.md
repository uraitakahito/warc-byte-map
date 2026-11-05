---
title: Development
description: Running warc-byte-map locally, the layout of the repository, and publishing.
next: false
---

## Run it locally

Requires Node 24 and pnpm 11.

```sh
pnpm install
pnpm run site:dev   # the viewer: http://localhost:5291/warc-byte-map/
pnpm run docs:dev   # these docs: http://localhost:5292/warc-byte-map/docs/
pnpm run check      # audit, types, lint, tests, and the site with its checks
```

To see the viewer and the docs together, as they are published:

```sh
pnpm run site:build
pnpm run site:preview   # http://localhost:5291/warc-byte-map/
```

Both Vite servers (`site:dev` and `site:preview`) send `.gz` files with `Content-Encoding: gzip`, so the `.warc.gz` example shows only one record there (see [Link format](../links/#opening-a-warc-file-from-another-site)). GitHub Pages does not.

## Layout

- `src/map/`: the position-keeping reader. It turns the bytes of a WARC (Web ARChive) file into a tree of byte ranges, and depends on neither the DOM nor Node (`src/map/tsconfig.json` enforces this through types).
- `src/viewer/` and `site/`: the page that draws what the reader returns.
- `docs-site/`: these docs (Astro and Starlight). They are built into `dist-site/docs/`, below the output of the viewer.
- `scripts/`: the tools that the commands below run.

## Docs

English and Japanese pages come in pairs with the same file name, `docs-site/src/content/docs/<name>.md` and `docs-site/src/content/docs/ja/<name>.md`.

Write links between pages as relative links, such as `[Link format](links/)` from the overview and `[Link format](../links/)` from any other page. Write links to the viewer as absolute URLs.

`pnpm run site:check` builds the site and runs `scripts/check-doc-refs.ts`. Building alone is not enough: a broken link, or a page in only one language, still builds. The check looks at the pairs of pages, the repository paths named in the text, the two URLs in the README, the links from the viewer to the docs, and every link in the built docs.

## The examples

`pnpm run examples:build` writes `site/public/examples/types.warc` and its `.gz`. The output is fixed, so writing it again gives the same bytes, and a test compares them.

The links on the annotated WARC 1.1 give record positions in this file, in `_data/byte_map.yml` of [warc-specifications](https://github.com/uraitakahito/warc-specifications). If the positions change, update that table as well. The CI of that repository only checks the heading ids.

## The terms and the specification

`src/viewer/terms.ts` holds the labels and the sections they link to. `pnpm run check:spec-anchors` checks those section ids and numbers against the published annotated WARC 1.1. It reads a public page, so neither `check` nor CI runs it. Run it after you change the table or that page.

## Publishing

The site is published by pushing a version tag: an annotated tag `vX.Y.Z` on a commit of `main`. `.github/workflows/pages.yml` then builds the viewer and the docs into one artifact and deploys it. Merging into `main` publishes nothing, and the `github-pages` environment accepts deployments only from `v*` tags.

To publish a tag again:

```sh
gh workflow run pages.yml --ref vX.Y.Z
```

The tag is the only version. The `version` in `package.json` is not one.
