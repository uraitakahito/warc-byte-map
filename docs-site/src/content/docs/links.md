---
title: Link format
description: The URL of a view in the viewer, and how to open a WARC file from another site.
---

The viewer writes what you are looking at into the fragment of the URL (the part after `#`), so the URL of the page is a link to those bytes. **Copy link** copies it. The button appears for a file opened from a URL. A file from your computer has no URL, so it cannot be linked.

The [annotated WARC 1.1](https://uraitakahito.github.io/warc-specifications/specifications/warc-format/warc-1.1-annotated/) builds its "See the bytes ↗" links in this format.

## The keys

```text
https://uraitakahito.github.io/warc-byte-map/#src=<url>&rec=<position>&part=<id>&lang=en
```

| Key | Value |
|---|---|
| `src` | The URL of the WARC (Web ARChive) file. A relative URL is read from the location of the viewer, such as `examples/types.warc`. |
| `rec` | The position of the first byte of the record to open. |
| `member` | The position of a gzip member in the compressed file. Opens the first record that starts in that member. |
| `part` | The part to select: `record`, `header`, `block`, `payload`, `line.0` (the first field of the header), `line.0.value`, `block.entity` and so on. To find an id, select the row and read the URL. `src/map/parts.ts` builds them. |
| `bytes` | A range to select, as `<start>-<end>`. |
| `lang` | `en` or `ja`. Without it, the language of the browser decides. |

- If both `member` and `rec` are given, `member` wins. If neither finds a record, the first record opens.
- If `part` names a part of the record, `bytes` is ignored.
- In a `.warc.gz`, every position except `member` is in the inflated stream.
- A value that cannot be read is dropped, so a damaged link still opens as far as it can.

## Examples

These open the `hello-world.warc` example, whose response record starts at byte 1260:

- [The payload](https://uraitakahito.github.io/warc-byte-map/#src=https%3A%2F%2Furaitakahito.github.io%2Fwarc-specifications%2Fprimers%2Fweb-archive-formats%2Fhello-world.warc&rec=1260&part=payload&lang=en): `rec=1260&part=payload`
- [The header](https://uraitakahito.github.io/warc-byte-map/#src=https%3A%2F%2Furaitakahito.github.io%2Fwarc-specifications%2Fprimers%2Fweb-archive-formats%2Fhello-world.warc&rec=1260&part=header&lang=en): `rec=1260&part=header`
- [Eight bytes, `WARC/1.0`](https://uraitakahito.github.io/warc-byte-map/#src=https%3A%2F%2Furaitakahito.github.io%2Fwarc-specifications%2Fprimers%2Fweb-archive-formats%2Fhello-world.warc&rec=1260&bytes=1260-1268&lang=en): `rec=1260&bytes=1260-1268`

## Opening a WARC file from another site

The browser fetches `src`, so two things depend on the server of the file:

- **CORS (Cross-Origin Resource Sharing).** The server must allow other sites to read the file, with a header such as `Access-Control-Allow-Origin: *`. Otherwise the viewer says **Could not load**.
- **No `Content-Encoding: gzip` on a `.warc.gz`.** With that header, the browser inflates the file before the viewer sees it, and in Chrome only the first member survives. The viewer then shows one record and no gzip members. GitHub Pages does not add the header.
