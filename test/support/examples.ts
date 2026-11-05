/**
 * 試験に使う、自分で書いた例の record。仕様の Annex B と primer の file は写さない
 * （本文の使ってよい範囲が決まっていないため）。名前は .test の予約の域だけを使う。
 */
import { BLOCK_LENGTH, type RecordSpec } from "./build-warc.ts";

const date = { name: "WARC-Date", value: "2026-11-05T00:00:00Z" } as const;
const id = (n: number) => ({ name: "WARC-Record-ID", value: `<urn:uuid:00000000-0000-4000-8000-00000000000${String(n)}>` });
const length = { name: "Content-Length", value: BLOCK_LENGTH } as const;
const target = { name: "WARC-Target-URI", value: "http://example.test/" } as const;

/** warcinfo・request・response・metadata の 4 record（WARC/1.1・改行はすべて CR LF）。 */
export const minimalRecords: readonly RecordSpec[] = [
  {
    lines: [{ name: "WARC-Type", value: "warcinfo" }, date, id(1), { name: "Content-Type", value: "application/warc-fields" }, length],
    block: "software: warc-byte-map test\r\nformat: WARC File Format 1.1\r\n",
  },
  {
    lines: [
      { name: "WARC-Type", value: "request" },
      target,
      date,
      id(2),
      { name: "Content-Type", value: "application/http;msgtype=request" },
      length,
    ],
    block: { startLine: "GET / HTTP/1.1", lines: [{ name: "Host", value: "example.test" }], entity: "" },
  },
  {
    lines: [
      { name: "WARC-Type", value: "response" },
      target,
      date,
      id(3),
      { name: "WARC-Concurrent-To", value: "<urn:uuid:00000000-0000-4000-8000-000000000002>" },
      { name: "Content-Type", value: "application/http;msgtype=response" },
      length,
    ],
    // payload が LF LF で終わる（record を閉じる CR LF CR LF が、その直後に続く）
    block: {
      startLine: "HTTP/1.1 200 OK",
      lines: [
        { name: "Content-Type", value: "text/plain" },
        { name: "Content-Length", value: "14" },
      ],
      entity: "hello, bytes\n\n",
    },
  },
  {
    lines: [
      { name: "WARC-Type", value: "metadata" },
      target,
      date,
      id(4),
      { name: "WARC-Refers-To", value: "<urn:uuid:00000000-0000-4000-8000-000000000003>" },
      { name: "Content-Type", value: "application/warc-fields" },
      length,
    ],
    block: "via: http://example.test/\r\n",
  },
];
