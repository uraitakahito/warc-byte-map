---
title: warc-byte-map
description: A viewer that shows which bytes of a WARC file each term of the WARC 1.1 specification refers to.
---

warc-byte-map is a viewer for WARC (Web ARChive) files. It shows which bytes of a file each term of the WARC 1.1 specification refers to: record, header, block, payload and so on.

**[Open the viewer](https://uraitakahito.github.io/warc-byte-map/)**

The viewer runs in your browser. A file you open from your computer stays there and is not uploaded.

## What it shows

- **The parts of a record.** Each record is split into its parts, down to the colon between a field's name and its value, and every part has a byte range.
- **Terms and bytes side by side.** Point at a part and its bytes are highlighted in the hex dump. Point at a byte and its part is highlighted.
- **What the digests cover.** `WARC-Block-Digest` and `WARC-Payload-Digest` are computed again in the browser, and you can see which bytes each one covers.
- **How records connect.** Fields that point at other records, such as `WARC-Refers-To`, open the record they point at.
- **Compressed files.** A `.warc.gz` is inflated one gzip member at a time, and each record shows where its member sits in the compressed file.

When a file is opened from a URL, the URL of the page is a link to the bytes you are looking at.

## Where the terms come from

The explanations in the viewer are written for this project and do not copy the text of the specification. They link to the matching section of the [annotated WARC 1.1](https://uraitakahito.github.io/warc-specifications/specifications/warc-format/warc-1.1-annotated/). That page is published by [warc-specifications](https://github.com/uraitakahito/warc-specifications), a fork of the specifications of the IIPC (International Internet Preservation Consortium).

The links also go the other way: the headings of the terms on that page have a "See the bytes ↗" link that opens an example in the viewer.

## In these docs

- [Reading the viewer](viewer/): how to open a file, and what each part of the screen means.
- [Link format](links/): the URL of a view, and how to open a WARC file from another site.
- [Development](development/): running it locally, the layout of the repository, and publishing.
