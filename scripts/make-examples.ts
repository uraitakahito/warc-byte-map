/**
 * viewer が開く例の WARC（WARC/1.1）を、自分で書いて作る。
 *
 *   pnpm run examples:build   → site/public/examples/types.warc と types.warc.gz
 *
 * 仕様の Annex B の例は写さない（本文の使ってよい範囲が決まっていないため）。同じ役の例を、
 * 長さも digest も正しく書く。8 つの type（warcinfo・request・response・resource・metadata・
 * revisit・conversion・continuation）と、chunked の response を 2 つ、2 つに割った record を含む。
 *
 * chunked の response の WARC-Payload-Digest は、2 つの読み方で書く。record 8 は仕様の読み
 * （RFC 2616 の entity-body。Transfer-Encoding を解いた bytes）、record 11 は送られたままの bytes。
 * warcio 1.8.2 の check は後者で計算し、record 8 を「payload digest failed」と言う（2026-11-05 に確かめた）。
 * 名前は予約の域（.test）と、文書のための IP（192.0.2.0/24）だけを使う。
 * 出力は決まった形（日時も id も固定）なので、作り直しても bytes は変わらない。
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

/** 書き出す場所。引数で替えられる（試験が、作り直した物と repo の物を比べるため）。 */
const OUT = process.argv[2] === undefined ? new URL("../site/public/examples/", import.meta.url) : new URL(`file://${process.argv[2].replace(/\/?$/, "/")}`);
const enc = new TextEncoder();
const DATE = "2026-11-05T00:00:00Z";
const LATER = "2026-11-05T01:00:00Z";
const id = (n: number): string => `<urn:uuid:7e5d0000-0000-4000-8000-${String(n).padStart(12, "0")}>`;
const sha1 = (bytes: Uint8Array): string => {
  // RFC 4648 の base32（WARC の例の慣わし。= の埋めは SHA-1 の 160 bit では出ない）
  const digest = createHash("sha1").update(bytes).digest();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of digest) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(buffer >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  return `sha1:${out}`;
};

/** 欄（順は書いたとおり）と block から、1 つの record の bytes を作る。Content-Length は最後に足す。 */
const record = (fields: readonly [string, string][], block: Uint8Array): Uint8Array => {
  const head = ["WARC/1.1", ...fields.map(([name, value]) => `${name}: ${value}`), `Content-Length: ${String(block.length)}`, "", ""].join("\r\n");
  return Buffer.concat([enc.encode(head), block, enc.encode("\r\n\r\n")]);
};

const httpRequest = enc.encode("GET / HTTP/1.1\r\nHost: example.test\r\nUser-Agent: warc-byte-map-example\r\n\r\n");
const html = enc.encode("<!doctype html><title>Example</title><p>Hello, bytes.</p>\n");
const responseHead = `HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${String(html.length)}\r\n\r\n`;
const httpResponse = Buffer.concat([enc.encode(responseHead), html]);

const chunkedEntity = ["<!doctype html><p>Sent in ", "two chunks.</p>\n"];
const chunkedPayload = enc.encode(chunkedEntity.join(""));
const chunkedAsSent = enc.encode(`${chunkedEntity.map((c) => `${enc.encode(c).length.toString(16)}\r\n${c}\r\n`).join("")}0\r\n\r\n`);
const chunkedResponse = Buffer.concat([
  enc.encode("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nTransfer-Encoding: chunked\r\n\r\n"),
  chunkedAsSent,
]);

const largeBody = enc.encode(`${"0123456789abcdef".repeat(8)}\n`);
const largeResponse = Buffer.concat([enc.encode(`HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${String(largeBody.length)}\r\n\r\n`), largeBody]);
const cut = 90; // 2 つに割る位置（HTTP の header の後、entity の途中）
const [segment1, segment2] = [largeResponse.subarray(0, cut), largeResponse.subarray(cut)];

const dns = enc.encode("20261105000000\nexample.test.\t300\tIN\tA\t192.0.2.10\n");
const warcinfo = enc.encode(
  [
    "software: warc-byte-map examples (scripts/make-examples.ts)",
    "format: WARC File Format 1.1",
    "conformsTo: http://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.1/",
    "description: One record of each WARC record type, written for warc-byte-map.",
    "note: The two chunked responses carry WARC-Payload-Digest over the de-chunked entity-body (RFC 2616, record 8) and over the entity as transferred (record 11). Tools differ on which one they compute.",
    "",
  ].join("\r\n"),
);
const metadata = enc.encode("via: http://example.test/\r\nfetchTimeMs: 12\r\n");
const conversion = enc.encode("Example\nHello, bytes.\n");
const revisitBlock = enc.encode(responseHead);

const records: Uint8Array[] = [
  record([["WARC-Type", "warcinfo"], ["WARC-Date", DATE], ["WARC-Record-ID", id(1)], ["WARC-Filename", "types.warc"], ["Content-Type", "application/warc-fields"], ["WARC-Block-Digest", sha1(warcinfo)]], warcinfo),
  record(
    [
      ["WARC-Type", "request"], ["WARC-Target-URI", "http://example.test/"], ["WARC-Date", DATE], ["WARC-Record-ID", id(2)], ["WARC-Warcinfo-ID", id(1)],
      ["WARC-Concurrent-To", id(3)], ["Content-Type", "application/http;msgtype=request"], ["WARC-Block-Digest", sha1(httpRequest)], ["WARC-Payload-Digest", sha1(new Uint8Array())],
    ],
    httpRequest,
  ),
  record(
    [
      ["WARC-Type", "response"], ["WARC-Target-URI", "http://example.test/"], ["WARC-Date", DATE], ["WARC-Record-ID", id(3)], ["WARC-Warcinfo-ID", id(1)],
      ["WARC-Concurrent-To", id(2)], ["WARC-IP-Address", "192.0.2.10"], ["Content-Type", "application/http;msgtype=response"],
      ["WARC-Block-Digest", sha1(httpResponse)], ["WARC-Payload-Digest", sha1(html)], ["WARC-Identified-Payload-Type", "text/html"],
    ],
    httpResponse,
  ),
  record(
    [
      ["WARC-Type", "metadata"], ["WARC-Target-URI", "http://example.test/"], ["WARC-Date", DATE], ["WARC-Record-ID", id(4)], ["WARC-Warcinfo-ID", id(1)],
      ["WARC-Refers-To", id(3)], ["Content-Type", "application/warc-fields"], ["WARC-Block-Digest", sha1(metadata)],
    ],
    metadata,
  ),
  record(
    [
      ["WARC-Type", "resource"], ["WARC-Target-URI", "dns:example.test"], ["WARC-Date", DATE], ["WARC-Record-ID", id(5)], ["WARC-Warcinfo-ID", id(1)],
      ["Content-Type", "text/dns"], ["WARC-Block-Digest", sha1(dns)], ["WARC-Payload-Digest", sha1(dns)],
    ],
    dns,
  ),
  record(
    [
      ["WARC-Type", "revisit"], ["WARC-Target-URI", "http://example.test/"], ["WARC-Date", LATER], ["WARC-Record-ID", id(6)], ["WARC-Warcinfo-ID", id(1)],
      ["WARC-Profile", "http://netpreserve.org/warc/1.1/revisit/identical-payload-digest"], ["WARC-Refers-To", id(3)],
      ["WARC-Refers-To-Target-URI", "http://example.test/"], ["WARC-Refers-To-Date", DATE], ["Content-Type", "application/http;msgtype=response"],
      ["WARC-Block-Digest", sha1(revisitBlock)], ["WARC-Payload-Digest", sha1(html)],
    ],
    revisitBlock,
  ),
  record(
    [
      ["WARC-Type", "conversion"], ["WARC-Target-URI", "http://example.test/"], ["WARC-Date", LATER], ["WARC-Record-ID", id(7)], ["WARC-Warcinfo-ID", id(1)],
      ["WARC-Refers-To", id(3)], ["Content-Type", "text/plain"], ["WARC-Block-Digest", sha1(conversion)], ["WARC-Payload-Digest", sha1(conversion)],
    ],
    conversion,
  ),
  record(
    [
      ["WARC-Type", "response"], ["WARC-Target-URI", "http://example.test/chunked"], ["WARC-Date", DATE], ["WARC-Record-ID", id(8)], ["WARC-Warcinfo-ID", id(1)],
      ["Content-Type", "application/http;msgtype=response"], ["WARC-Block-Digest", sha1(chunkedResponse)], ["WARC-Payload-Digest", sha1(chunkedPayload)],
    ],
    chunkedResponse,
  ),
  record(
    [
      ["WARC-Type", "response"], ["WARC-Target-URI", "http://example.test/large"], ["WARC-Date", DATE], ["WARC-Record-ID", id(9)], ["WARC-Warcinfo-ID", id(1)],
      ["WARC-Segment-Number", "1"], ["Content-Type", "application/http;msgtype=response"],
      ["WARC-Block-Digest", sha1(segment1)], ["WARC-Payload-Digest", sha1(largeBody)],
    ],
    segment1,
  ),
  record(
    [
      ["WARC-Type", "continuation"], ["WARC-Target-URI", "http://example.test/large"], ["WARC-Date", DATE], ["WARC-Record-ID", id(10)], ["WARC-Warcinfo-ID", id(1)],
      ["WARC-Segment-Origin-ID", id(9)], ["WARC-Segment-Number", "2"], ["WARC-Segment-Total-Length", String(largeResponse.length)],
      ["WARC-Block-Digest", sha1(segment2)],
    ],
    segment2,
  ),
  record(
    [
      ["WARC-Type", "response"], ["WARC-Target-URI", "http://example.test/chunked-as-sent"], ["WARC-Date", DATE], ["WARC-Record-ID", id(11)], ["WARC-Warcinfo-ID", id(1)],
      ["Content-Type", "application/http;msgtype=response"], ["WARC-Block-Digest", sha1(chunkedResponse)], ["WARC-Payload-Digest", sha1(chunkedAsSent)],
    ],
    chunkedResponse,
  ),
];

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL("types.warc", OUT), Buffer.concat(records));
// 1 record 1 member（WARC 1.1 の Annex D が勧める形）。Node の zlib は gzip の header の MTIME を 0 で書く。
// OS の octet は作った機械で変わる（macOS は 19、Linux は 3）ので、.gz は作った機械まで同じとは限らない
writeFileSync(new URL("types.warc.gz", OUT), Buffer.concat(records.map((r) => gzipSync(r, { level: 9 }))));
console.log(`types.warc: ${String(records.length)} records, ${String(Buffer.concat(records).length)} octets`);
