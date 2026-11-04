# warc-byte-map

WARC（Web ARChive）1.1 の仕様の用語（record・header・block・payload など）が、WARC の file のどの byte を指すかを見せる viewer です。

- 頁: https://uraitakahito.github.io/warc-byte-map/ （版のタグを打つたびに出し直します）
- 用語の出どころ: [注釈つきの WARC 1.1](https://uraitakahito.github.io/warc-specifications/specifications/warc-format/warc-1.1-annotated/)（[uraitakahito/warc-specifications](https://github.com/uraitakahito/warc-specifications)）

## 手元で動かす

Node 24 と pnpm 11 が要ります。

```sh
pnpm install
pnpm run site:dev   # http://localhost:5291/warc-byte-map/
pnpm run check      # audit・型・lint・試験・頁の build
```

## 作り

- `src/map/`: 位置つきの読み手。WARC の bytes から、byte の範囲の木を返します。DOM にも Node にも頼りません（`src/map/tsconfig.json` が型で守ります）。
- `src/viewer/` と `site/`: 読み手の結果を描く頁です。

## License

[The Unlicense](LICENSE)

---

# warc-byte-map (English)

A viewer that shows which bytes of a WARC (Web ARChive) file each term of the WARC 1.1 specification (record, header, block, payload, …) refers to.

- Site: https://uraitakahito.github.io/warc-byte-map/ (republished on every version tag)
- Where the terms come from: [the annotated WARC 1.1](https://uraitakahito.github.io/warc-specifications/specifications/warc-format/warc-1.1-annotated/) ([uraitakahito/warc-specifications](https://github.com/uraitakahito/warc-specifications))

## Run it locally

Requires Node 24 and pnpm 11.

```sh
pnpm install
pnpm run site:dev   # http://localhost:5291/warc-byte-map/
pnpm run check      # audit, types, lint, tests and the site build
```

## Layout

- `src/map/`: the position-keeping reader. It turns the bytes of a WARC file into a tree of byte ranges, and depends on neither the DOM nor Node (`src/map/tsconfig.json` enforces this through types).
- `src/viewer/` and `site/`: the page that draws what the reader returns.

## License

[The Unlicense](LICENSE)
