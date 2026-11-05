---
title: warc-byte-map
description: WARC 1.1 の仕様の用語が、WARC ファイルのどの byte を指すかを見せる viewer です。
---

warc-byte-map は、WARC（Web ARChive）ファイルの viewer です。record・header・block・payload など、WARC 1.1 の仕様の用語がファイルのどの byte を指すかを見せます。

**[viewer を開く](https://uraitakahito.github.io/warc-byte-map/#lang=ja)**

viewer はブラウザの中で動きます。手元のファイルを開いても、ファイルはどこにも送られません。

## 見せるもの

- **record の部分。** record を部分に割ります。欄の名前と値の間のコロンまで割り、どの部分にも byte の範囲を示します。
- **用語と byte の対応。** 部分を指すと hex の byte が強調され、byte を指すとその部分が強調されます。
- **digest が掛かる範囲。** `WARC-Block-Digest` と `WARC-Payload-Digest` をブラウザで計算し直し、それぞれがどの byte に掛かるかを見せます。
- **record どうしのつながり。** `WARC-Refers-To` など、ほかの record を指す欄から、指す先の record を開けます。
- **圧縮したファイル。** `.warc.gz` は gzip の member ごとに解き、record ごとに、その member が圧縮したファイルのどこにあるかを示します。

URL から開いたファイルなら、ページの URL が、見ている byte へのリンクになります。

## 用語の出どころ

viewer の説明はこのプロジェクトのために書いたもので、仕様の本文は写していません。説明からは、[注釈つきの WARC 1.1](https://uraitakahito.github.io/warc-specifications/specifications/warc-format/warc-1.1-annotated/) の該当する節へリンクしています。このページを公開しているのは、IIPC（International Internet Preservation Consortium）の仕様の fork である [warc-specifications](https://github.com/uraitakahito/warc-specifications) です。

逆向きのリンクもあります。このページの用語の見出しの横にある「See the bytes ↗」から、viewer で例を開けます。

## このドキュメントの内容

- [viewer の読み方](viewer/): ファイルの開き方と、画面の各部分の意味。
- [リンクの形](links/): 見ている物を指す URL の形と、ほかのサイトの WARC ファイルの開き方。
- [開発](development/): 手元での動かし方、リポジトリの構成、公開の手順。
