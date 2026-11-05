import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base16, base32, digestChecks, digestMatches, parseLabelledDigest } from "../../src/map/digest.ts";
import { mapWarc } from "../../src/map/record.ts";
import type { Payload } from "../../src/map/types.ts";
import { BLOCK_LENGTH, buildWarc, withoutProblems, type HttpSpec, type LineSpec, type RecordSpec } from "../support/build-warc.ts";
import { tilingViolations } from "../support/tiling.ts";

const length = { name: "Content-Length", value: BLOCK_LENGTH } as const;
const record = (type: string, block: string | HttpSpec, extra: readonly LineSpec[] = []): RecordSpec => ({
  lines: [
    { name: "WARC-Type", value: type },
    { name: "WARC-Target-URI", value: "http://example.test/" },
    ...(typeof block === "object" ? [{ name: "Content-Type", value: `application/http;msgtype=${type}` }] : []),
    ...extra,
    length,
  ],
  block,
});
const response = (entity: string | readonly string[], lines: readonly LineSpec[] = []): HttpSpec => ({
  startLine: "HTTP/1.1 200 OK",
  lines: [{ name: "Content-Type", value: "text/plain" }, ...lines],
  entity,
});

describe("mapWarc: application/http の block", () => {
  it("start line・欄・空行・entity を、組み立てたとおりの範囲で返す", () => {
    const built = buildWarc([record("response", response("hello\n"))]);
    const map = mapWarc(built.bytes);
    expect(withoutProblems(map.records)).toEqual(built.records);
    expect(map.records[0]!.problems).toEqual([]);
    expect(tilingViolations(map, built.bytes.length)).toEqual([]);
  });

  it("chunked の entity を chunk に割り、payload を chunk の data の並びにする", () => {
    const built = buildWarc([record("response", response(["hello", ", ", "world"], [{ name: "Transfer-Encoding", value: "chunked" }]))]);
    const r = mapWarc(built.bytes).records[0]!;
    expect(withoutProblems([r])).toEqual(built.records);
    const chunks = built.records[0]!.http!.chunked!.chunks;
    expect(r.payload).toEqual({ kind: "here", spans: chunks.map((c) => c.data) });
    const joined = r.payload.kind === "here" ? r.payload.spans.map((s) => new TextDecoder().decode(built.bytes.subarray(s.start, s.end))).join("") : "";
    expect(joined).toBe("hello, world");
  });

  it.each([
    ["長さが 16 進でない", "zz\r\nhello\r\n0\r\n\r\n"],
    ["長さの後に data の改行が来ない", "3\r\nhello\r\n0\r\n\r\n"],
  ])("chunk の形に読めなければ（%s）chunked-malformed を言い、payload は決められない", (_title, entity) => {
    const built = buildWarc([record("response", response(entity, [{ name: "Transfer-Encoding", value: "chunked" }]))]);
    const r = mapWarc(built.bytes).records[0]!;
    expect(r.problems.map((p) => p.code)).toEqual(["chunked-malformed"]);
    expect(r.http?.chunked).toBeUndefined();
    expect(r.payload).toEqual({ kind: "unreadable" });
  });

  it("HTTP の header が block の中で閉じなければ http-no-blank-line を言い、http を返さない", () => {
    const built = buildWarc([
      { lines: [{ name: "WARC-Type", value: "response" }, { name: "WARC-Target-URI", value: "http://example.test/" }, { name: "Content-Type", value: "application/http" }, length], block: "HTTP/1.1 200 OK\r\nX: y\r\n" },
    ]);
    const r = mapWarc(built.bytes).records[0]!;
    expect(r.http).toBeUndefined();
    expect(r.problems.map((p) => p.code)).toEqual(["http-no-blank-line"]);
    expect(r.payload).toEqual({ kind: "unreadable" });
  });
});

describe("mapWarc: payload の定め（WARC 1.1 の §6）", () => {
  const cases: readonly [string, RecordSpec, (built: ReturnType<typeof buildWarc>) => Payload][] = [
    ["response（http）は entity", record("response", response("body")), (b) => ({ kind: "here", spans: [b.records[0]!.http!.entity] })],
    ["request（http）は entity", record("request", { startLine: "GET / HTTP/1.1", lines: [], entity: "" }), (b) => ({ kind: "here", spans: [b.records[0]!.http!.entity] })],
    ["resource は block 全体", record("resource", "plain text"), (b) => ({ kind: "here", spans: [b.records[0]!.block] })],
    ["conversion は block 全体", record("conversion", "converted"), (b) => ({ kind: "here", spans: [b.records[0]!.block] })],
    ["revisit は別の record の物", record("revisit", response("")), () => ({ kind: "elsewhere", reason: "revisit" })],
    ["continuation は logical record の物", record("continuation", "rest of the block"), () => ({ kind: "elsewhere", reason: "segment" })],
    [
      "WARC-Segment-Number を持つ response も logical record の物",
      record("response", response("part"), [{ name: "WARC-Segment-Number", value: "1" }]),
      () => ({ kind: "elsewhere", reason: "segment" }),
    ],
    ["warcinfo は定めが無い", record("warcinfo", "software: x\r\n"), () => ({ kind: "not-defined" })],
    ["metadata は定めが無い", record("metadata", "via: x\r\n"), () => ({ kind: "not-defined" })],
    [
      "http でない scheme の response は、block が application/http でも定めが無い",
      {
        ...record("response", response("body")),
        lines: [
          { name: "WARC-Type", value: "response" },
          { name: "WARC-Target-URI", value: "ftp://example.test/a" },
          { name: "Content-Type", value: "application/http;msgtype=response" },
          length,
        ],
      },
      () => ({ kind: "not-defined" }),
    ],
  ];

  it.each(cases)("%s", (_title, spec, expected) => {
    const built = buildWarc([spec]);
    expect(mapWarc(built.bytes).records[0]!.payload).toEqual(expected(built));
  });
});

describe("digest", () => {
  it("base32 は RFC 4648 の例と同じ（= の埋めは付けない）", () => {
    const vectors = ["", "f", "fo", "foo", "foob", "fooba", "foobar"];
    expect(vectors.map((v) => base32(new TextEncoder().encode(v)))).toEqual(["", "MY", "MZXQ", "MZXW6", "MZXW6YQ", "MZXW6YTB", "MZXW6YTBOI"]);
  });

  it("欄の値を算法と値に分け、形が違えば undefined", () => {
    expect(parseLabelledDigest(" SHA1:ABC= ")).toEqual({ algorithm: "sha1", value: "ABC=" });
    expect(parseLabelledDigest("ABC")).toBeUndefined();
  });

  it("hash が base32 か base16 の値と同じか（大文字小文字と = の埋めは問わない）", () => {
    const hash = createHash("sha256").update("x").digest();
    expect(digestMatches(hash, `${base32(hash).toLowerCase()}====`)).toBe(true);
    expect(digestMatches(hash, base16(hash).toUpperCase())).toBe(true);
    expect(digestMatches(hash, base32(createHash("sha256").update("y").digest()))).toBe(false);
  });

  it("2 つの digest の欄と、それぞれが掛かる範囲を返す（chunked なら、解かない entity も）", () => {
    const sha1 = (s: string) => `sha1:${base32(createHash("sha1").update(s).digest())}`;
    const built = buildWarc([
      record("response", response(["ab", "c"], [{ name: "Transfer-Encoding", value: "chunked" }]), [
        { name: "WARC-Block-Digest", value: "sha1:AAAA" },
        { name: "WARC-Payload-Digest", value: sha1("abc") },
      ]),
    ]);
    const r = mapWarc(built.bytes).records[0]!;
    const checks = digestChecks(built.bytes, r);
    expect(checks.map((c) => [c.name, c.declared?.algorithm, c.spans])).toEqual([
      ["WARC-Block-Digest", "sha1", [r.block]],
      ["WARC-Payload-Digest", "sha1", r.payload.kind === "here" ? r.payload.spans : []],
    ]);
    expect(checks[1]!.alternative).toEqual([r.http!.entity]);
  });
});
