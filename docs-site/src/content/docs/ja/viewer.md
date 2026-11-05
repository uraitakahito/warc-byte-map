---
title: viewer の読み方
description: WARC ファイルを viewer で開く手順と、画面の各部分の意味。
---

## ファイルを開く

[viewer](https://uraitakahito.github.io/warc-byte-map/#lang=ja) の最初のページには、開き方が 3 つあります。

- **例を開く: hello-world.warc** は、IIPC（International Internet Preservation Consortium）の primer にある WARC（Web ARChive）の例を開きます。ファイルは [warc-specifications](https://github.com/uraitakahito/warc-specifications) のサイトから読みます。
- **例を開く: types.warc** は、このプロジェクトのために書いた WARC/1.1 のファイルを開きます。すべての type の record と、chunked の response を 2 つ、2 つに割った record が入っています。同じ内容の `.warc.gz` も開けます。
- **手元の WARC を開く** は、手元の `.warc` か `.warc.gz` を開きます。ファイルをページに落としても開けます。ファイルはブラウザの中で読むので、どこにも送られません。

開けるファイルは 256 MiB までで、`.warc.gz` は解いた大きさが 512 MiB までです。

**ほかの file を開く** で最初のページへ戻ります。もう一方の言語の名前のボタンで、画面の言語が替わります。

## 画面

ウィンドウの幅が広いと 3 列で並びます。少し狭いと hex が下へ移り、さらに狭いと全部が縦に並びます。

- **record の一覧** には、record ごとに番号・`WARC-Type`・`WARC-Target-URI`・byte の範囲が並びます。`!` は問題のある record の印です。行を押すと、その record が開きます。一覧に並ぶのは最初の 5,000 件までです。
- **カード** は開いている record を示します。問題、payload と digest、つながり、部分の木の順に並びます。
- **hex** は開いている record の byte を、16 進と文字で示します。文字の列では、CR と LF を `␍` と `␊`、空白を `·`、タブを `⇥`、そのほかの印字できない byte を `.` で描きます。16 KiB より長い record は先頭と末尾だけを描き、間に省いた byte の数を示します。

## 部分と byte

部分の木は、record を上から割っていきます。`WARC record` の中に `WARC record header`、`WARC record content block`、record を閉じる `CRLF CRLF` があります。`application/http` の block は、さらに HTTP の header、その欄、entity-body と chunk に割ります。子の範囲を前から並べると親の範囲にちょうど等しいので、record のどの byte も、どれかの部分に属します。

木の行には、名前、値の冒頭、byte の範囲、`§3.1.1` のような注釈つきの WARC 1.1 の節へのリンクがあります。名前にポインタを置くと、短い説明が出ます。

- 行を指すと、その byte が強調されます。byte を指すと、それを含むいちばん小さい部分の行が強調されます。
- 行か byte を押すと、選んだ状態になります。強調が残り、URL に選んだ物が書かれます（[リンクの形](../links/)）。
- 欄など `▸` の付いた行は畳んであります。三角を押すと、名前・コロン・値・改行が見えます。

## 範囲の読み方

`1309–2014（705）` のような範囲は、最初の byte の位置、最後の byte のすぐ後の位置、byte で数えた長さです。位置はファイルの先頭から数えます（`.warc.gz` は[後述](#warcgz-ファイル)）。画面の `octet` は、仕様が byte の意味で使う語です。

## payload と digest

カードの上部に、その record の payload がどこにあるかを示します。

- **この record の中** は、長さを示します。**強調** を押すと、その byte が強調されます。chunked の response では、payload は chunk の data の並びなので、範囲は複数になります。
- **この record には無い** は、`revisit` の record（payload は参照先の record の物）と segment（payload は logical record の物）に出ます。
- `warcinfo` や `metadata` のように payload の定めが無い type では、そのように示します。

record に `WARC-Block-Digest` や `WARC-Payload-Digest` の欄があれば、カードにその行が出ます。viewer はブラウザの WebCrypto（暗号の API）で hash を計算し、欄の値（base32 か base16）と比べます。

| 画面の文 | 意味 |
|---|---|
| **一致 ✓** | 計算した hash が欄の値と同じです。 |
| **chunk のまま（Transfer-Encoding を解かない entity）に掛けると一致する** | 欄の値は、payload ではなく、送られたままの chunked の byte の hash です。 |
| **不一致。計算した値 …** ✗ | どちらの読み方でも一致しません。計算した値を示します。 |
| **この算法は WebCrypto に無いので計算できない** | MD5 など、ブラウザでは計算できない算法です。 |

**再現** には、同じ hash をブラウザの外で計算する shell のコマンドが出ます。出るのは、digest が 1 つの範囲に掛かるときです。ファイルのあるディレクトリで実行します。

## つながり

**つながり** には、ほかの record の `WARC-Record-ID` を値に持つ欄（`WARC-Concurrent-To`・`WARC-Refers-To`・`WARC-Warcinfo-ID`・`WARC-Segment-Origin-ID`）が並びます。指す先が同じファイルにあれば、ボタンで開けます。無ければ **この file に無い** と出ます。**ここを指す record** には、同じファイルの中でこの record を指す record が並びます。

## 問題

**見つかった問題** には、決まった形でない所が並びます。LF だけで終わる行や、`Content-Length` の先で record が閉じていない場合などです。問題を押すと、その byte が強調されます。record として読み進められなくなると、一覧の最後に **record として読めない残り** とその範囲が出ます。

## `.warc.gz` ファイル

`.warc.gz` は gzip の member の並びで、普通は record ごとに 1 つです。viewer は member を 1 つずつ解き、2 種類の位置を示します。

- **解いた流れの中の位置。** 範囲と hex はすべてこの位置です。ファイルを先に解いたものとして数えます。
- **圧縮したファイルの中の位置。** カードに `member #2: file の中 907–1630（723）` のように member の範囲が出ます。CDX（WARC ファイルのどこに record があるかを並べた索引）などの索引が示すのは、こちらの位置です。

一覧の先頭に、member の数と 2 つの大きさが出ます。**再現** のコマンドが `gzip -dc` で始まるのは、位置が解いた流れの中の位置だからです。
