---
title: 開発
description: warc-byte-map を手元で動かす手順、リポジトリの構成、公開の手順。
next: false
---

## 手元で動かす

Node 24 と pnpm 11 が要ります。

```sh
pnpm install
pnpm run site:dev   # viewer: http://localhost:5291/warc-byte-map/
pnpm run docs:dev   # このドキュメント: http://localhost:5292/warc-byte-map/docs/ja/
pnpm run check      # audit・型・lint・試験・サイトの build と検査
```

viewer とドキュメントを、公開するときと同じ形で一緒に見るには、次のようにします。

```sh
pnpm run site:build
pnpm run site:preview   # http://localhost:5291/warc-byte-map/
```

Vite のサーバ（`site:dev` と `site:preview`）は `.gz` のファイルに `Content-Encoding: gzip` を付けて配るので、例の `.warc.gz` は 1 つの record だけが出ます（[リンクの形](../links/#ほかのサイトの-warc-ファイルを開く)）。GitHub Pages では起きません。

## 構成

- `src/map/`: 位置つきの読み手。WARC（Web ARChive）ファイルの byte から、byte の範囲の木を返します。DOM にも Node にも頼りません（`src/map/tsconfig.json` が型で守ります）。
- `src/viewer/` と `site/`: 読み手の結果を描くページです。
- `docs-site/`: このドキュメントです（Astro と Starlight）。viewer の出力の下の `dist-site/docs/` に build します。
- `scripts/`: 下で説明するコマンドが実行するスクリプトです。

## ドキュメント

英語と日本語のページは、同じファイル名の対です（`docs-site/src/content/docs/<名前>.md` と `docs-site/src/content/docs/ja/<名前>.md`）。

ページどうしのリンクは相対で書きます。概要からは `[リンクの形](links/)`、ほかのページからは `[リンクの形](../links/)` です。viewer へのリンクは絶対 URL で書きます。

`pnpm run site:check` は、サイトを build してから `scripts/check-doc-refs.ts` を実行します。build だけでは足りません。切れたリンクも、片方の言語にしか無いページも、そのまま build が通るからです。検査が見るのは、ページの対、本文に書いたリポジトリの path、README の 2 本の URL、viewer からドキュメントへのリンク、build したドキュメントの全部のリンクです。

## 例のファイル

`pnpm run examples:build` は `site/public/examples/types.warc` と、その `.gz` を書きます。出力は決まった形なので、書き直しても同じ byte になり、試験が比べています。

注釈つきの WARC 1.1 からのリンクは、[warc-specifications](https://github.com/uraitakahito/warc-specifications) の `_data/byte_map.yml` に、このファイルの record の位置を持っています。位置が変わったら、その表も直します。そのリポジトリの CI が見るのは見出しの id だけです。

## 用語と仕様

`src/viewer/terms.ts` に、画面の説明とリンク先の節があります。`pnpm run check:spec-anchors` は、その節の id と番号を、公開されている注釈つきの WARC 1.1 と照らします。公開のページを読むので、`check` にも CI にも入れていません。表やそのページを変えた後に手元で実行します。

## 公開

サイトの公開は、版のタグの push で行います。`main` の commit に打つ注釈タグ `vX.Y.Z` です。push すると `.github/workflows/pages.yml` が viewer とドキュメントを 1 つの artifact に build して配信します。`main` への merge では公開されません。環境 `github-pages` も `v*` のタグからの deploy だけを受け付けます。

同じタグをもう一度公開するには、次のようにします。

```sh
gh workflow run pages.yml --ref vX.Y.Z
```

版はタグだけです。`package.json` の `version` は版ではありません。
