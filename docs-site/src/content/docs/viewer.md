---
title: Reading the viewer
description: How to open a WARC file in the viewer, and what each part of the screen means.
---

## Opening a file

The start page of the [viewer](https://uraitakahito.github.io/warc-byte-map/) offers three ways in:

- **Open the example: hello-world.warc** opens the WARC (Web ARChive) example from the primer of the IIPC (International Internet Preservation Consortium). It is read from the site of [warc-specifications](https://github.com/uraitakahito/warc-specifications).
- **Open the example: types.warc** opens a WARC/1.1 file written for this project. It has a record of every type, two chunked responses and a record split into two segments. The same file is also offered as a `.warc.gz`.
- **Open a local WARC** opens a `.warc` or `.warc.gz` from your computer. You can also drop the file on the page. The file is read in the browser and is not uploaded.

A file can be up to 256 MiB, and a `.warc.gz` up to 512 MiB once inflated.

**Open another file** returns to the start page. The button named after the other language switches the language of the screen.

## The screen

A wide window has three columns. In a narrower window the hex dump moves below the other two, and in a narrow one all three stack.

- **The record list** has one line for each record: its number, `WARC-Type`, `WARC-Target-URI` and byte range. A `!` marks a record with problems. Click a line to open the record. The list stops after the first 5,000 records.
- **The card** shows the open record: any problems, the payload and digests, related records, and the tree of parts.
- **The hex dump** shows the bytes of the open record, in hexadecimal and as text. In the text, CR and LF are drawn as `␍` and `␊`, a space as `·`, a tab as `⇥`, and any other byte that cannot be printed as `.`. For a record longer than 16 KiB, only the start and the end are drawn, and a line between them says how many bytes were left out.

## Parts and bytes

The tree of parts divides the record from the top down. A `WARC record` contains a `WARC record header`, a `WARC record content block` and the closing `CRLF CRLF`. A block of type `application/http` is divided further into the HTTP header, its fields, and the entity body with its chunks. The children of a part cover exactly the range of the part, so every byte of a record belongs to a part.

Each row of the tree has a label, a preview of the value, a byte range and a link such as `§3.1.1` to that section of the annotated WARC 1.1. Hold the pointer over a label to read a short note.

- Point at a row and its bytes are highlighted. Point at a byte and the row of the smallest part around it is highlighted.
- Click a row or a byte to select it. The highlight stays and the URL records the selection (see [Link format](../links/)).
- Rows with a `▸`, such as the fields, are folded. Click the triangle to see the name, colon, value and line end.

## Reading a range

A range such as `1309–2014（705）` gives the position of the first byte, the position just after the last byte, and the length in bytes. Positions count from the start of the file, except in a `.warc.gz` (see [below](#warcgz-files)). The screen says `octet`, the word the specification uses for a byte.

## Payload and digests

The top of the card says where the payload of the record is:

- **In this record** gives its length, and **Highlight** marks its bytes. In a chunked response, the payload is the data of the chunks, so it is several ranges.
- **Not in this record** appears on a `revisit` record, whose payload belongs to the record it refers to, and on a segment, whose payload belongs to the logical record.
- For a type with no payload defined, such as `warcinfo` or `metadata`, the card says so.

If the record has a `WARC-Block-Digest` or `WARC-Payload-Digest` field, the card has a row for it. The viewer computes the hash in the browser with WebCrypto (the browser's cryptography API) and compares it with the value of the field, in base32 or base16:

| On the screen | What it means |
|---|---|
| **Matches ✓** | The computed hash equals the field. |
| **Matches when computed over the entity as transferred (chunked)** | The field holds the hash of the chunked bytes as they were sent, not of the payload. |
| **Does not match. Computed …** ✗ | Neither reading matches. The screen shows the computed hash. |
| **This algorithm is not available in WebCrypto** | The hash cannot be computed in the browser, for example MD5. |

**Reproduce** gives a shell command that computes the same hash outside the browser, for a digest that covers a single range. Run it in the directory of the file.

## Related records

**Related records** lists the fields whose value is the `WARC-Record-ID` of another record: `WARC-Concurrent-To`, `WARC-Refers-To`, `WARC-Warcinfo-ID` and `WARC-Segment-Origin-ID`. If that record is in the same file, a button opens it. If not, the row says **Not in this file**. **Pointed to by** lists the records in the file that point at this one.

## Problems

**Problems found** lists what does not have the expected form, such as a line that ends in a bare LF or a `Content-Length` that does not lead to the end of the record. Click a problem to mark its bytes. If the viewer cannot read on as records, the record list ends with **Bytes not readable as records** and the range of the rest.

## `.warc.gz` files

A `.warc.gz` is a series of gzip members, usually one for each record. The viewer inflates them one at a time and shows two kinds of position:

- **In the inflated stream.** Every range and the hex dump use these positions, as if the file had been inflated first.
- **In the compressed file.** The card gives the range of each member, such as `member #2: in the file 907–1630（723）`. An index such as CDX (a list of where each record sits in WARC files) gives this kind of position.

The head of the record list gives the number of members and both sizes. The **Reproduce** command starts with `gzip -dc`, because its positions are in the inflated stream.
