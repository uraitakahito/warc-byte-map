import { describe, expect, it } from "vitest";
import { formatHash, parseHash } from "../../src/viewer/hash.ts";

describe("parseHash と formatHash", () => {
  it("書いた物を読むと元に戻る", () => {
    const state = {
      src: "https://example.test/a b.warc?x=1&y=2",
      rec: 1260,
      part: "line.7.value",
      bytes: { start: 2332, end: 2345 },
      lang: "en" as const,
    };
    expect(parseHash(formatHash(state))).toEqual(state);
  });

  it("読めない値は捨てる", () => {
    expect(parseHash("#src=&rec=12a&part=&bytes=9-3&lang=fr")).toEqual({});
    expect(parseHash("#bytes=3-3")).toEqual({ bytes: { start: 3, end: 3 } });
  });

  it("何も無ければ空の hash", () => {
    expect(formatHash({})).toBe("");
    expect(parseHash("")).toEqual({});
  });
});
