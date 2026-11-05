---
title: リンクの形
description: viewer で見ている物を指す URL の形と、ほかのサイトの WARC ファイルの開き方。
---

viewer は、見ている物を URL の fragment（`#` より後ろ）に書きます。そのため、ページの URL が、その byte へのリンクになります。**link を写す** のボタンで写せます。ボタンが出るのは、URL から開いたファイルのときです。手元のファイルには URL が無いので、リンクにできません。

[注釈つきの WARC 1.1](https://uraitakahito.github.io/warc-specifications/specifications/warc-format/warc-1.1-annotated/) の「See the bytes ↗」のリンクも、この形で組み立てています。

## 指定できる項目

```text
https://uraitakahito.github.io/warc-byte-map/#src=<URL>&rec=<位置>&part=<id>&lang=ja
```

| 項目 | 値 |
|---|---|
| `src` | WARC（Web ARChive）ファイルの URL。相対の URL は viewer の場所から読みます（`examples/types.warc` など）。 |
| `rec` | 開く record の最初の byte の位置。 |
| `member` | 圧縮したファイルの中の gzip の member の位置。その member の中で始まる最初の record を開きます。 |
| `part` | 選ぶ部分。`record`・`header`・`block`・`payload`・`line.0`（header の最初の欄）・`line.0.value`・`block.entity` など。id は、行を選んで URL を読めば分かります。作っているのは `src/map/parts.ts` です。 |
| `bytes` | 選ぶ範囲。`<始め>-<終わり>` の形です。 |
| `lang` | `en` か `ja`。無ければブラウザの言語で決まります。 |

- `member` と `rec` の両方があれば `member` を優先します。どちらでも record が見つからなければ、最初の record を開きます。
- `part` が record の部分を指していれば、`bytes` は無視します。
- `.warc.gz` では、`member` のほかの位置はすべて解いた流れの中の位置です。
- 読めない値は捨てるので、壊れたリンクでも読める所までは開きます。

## 例

次のリンクは、例の `hello-world.warc` を開きます。response の record は byte 1260 から始まります。

- [payload](https://uraitakahito.github.io/warc-byte-map/#src=https%3A%2F%2Furaitakahito.github.io%2Fwarc-specifications%2Fprimers%2Fweb-archive-formats%2Fhello-world.warc&rec=1260&part=payload&lang=ja): `rec=1260&part=payload`
- [header](https://uraitakahito.github.io/warc-byte-map/#src=https%3A%2F%2Furaitakahito.github.io%2Fwarc-specifications%2Fprimers%2Fweb-archive-formats%2Fhello-world.warc&rec=1260&part=header&lang=ja): `rec=1260&part=header`
- [8 byte の `WARC/1.0`](https://uraitakahito.github.io/warc-byte-map/#src=https%3A%2F%2Furaitakahito.github.io%2Fwarc-specifications%2Fprimers%2Fweb-archive-formats%2Fhello-world.warc&rec=1260&bytes=1260-1268&lang=ja): `rec=1260&bytes=1260-1268`

## ほかのサイトの WARC ファイルを開く

`src` はブラウザが取りに行くので、ファイルを配るサーバに次の 2 つの条件があります。

- **CORS（Cross-Origin Resource Sharing）。** `Access-Control-Allow-Origin: *` のようなヘッダで、ほかのサイトからの読み取りを許している必要があります。許していないと、viewer は **読めなかった** と出します。
- **`.warc.gz` に `Content-Encoding: gzip` を付けないこと。** このヘッダがあると、viewer に渡る前にブラウザがファイルを解き、Chrome では最初の member しか残りません。viewer には 1 つの record だけが出て、gzip の member は出ません。GitHub Pages はこのヘッダを付けません。
