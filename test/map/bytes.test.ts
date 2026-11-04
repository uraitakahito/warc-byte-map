import { describe, expect, it } from "vitest";
import { ascii, indexOfSequence, latin1, skipBlanks, startsWithAt } from "../../src/map/bytes.ts";

const bytes = ascii("ab\r\n\r\nWARC/ \t x");

describe("startsWithAt", () => {
  it("その位置から並びが続けば真、はみ出すか違えば偽", () => {
    expect(startsWithAt(bytes, ascii("WARC/"), 6)).toBe(true);
    expect(startsWithAt(bytes, ascii("WARC/"), 7)).toBe(false);
    expect(startsWithAt(bytes, ascii("x!"), bytes.length - 1)).toBe(false);
    expect(startsWithAt(bytes, ascii("a"), -1)).toBe(false);
  });
});

describe("indexOfSequence", () => {
  it("from から後の最初の位置を返し、無ければ -1", () => {
    expect(indexOfSequence(bytes, ascii("\r\n\r\nWARC/"), 0)).toBe(2);
    expect(indexOfSequence(bytes, ascii("\r\n\r\nWARC/"), 3)).toBe(-1);
    expect(indexOfSequence(bytes, ascii("\r\n"), 3)).toBe(4);
    expect(indexOfSequence(bytes, new Uint8Array(), 0)).toBe(-1);
  });
});

describe("skipBlanks", () => {
  it("空白とタブの終わりを返し、範囲の終わりを越えない", () => {
    expect(skipBlanks(bytes, { start: 11, end: bytes.length })).toBe(14);
    expect(skipBlanks(bytes, { start: 11, end: 12 })).toBe(12);
  });
});

describe("latin1", () => {
  it("1 octet を 1 文字にする", () => {
    expect(latin1(Uint8Array.of(0x57, 0xe9, 0x00), { start: 0, end: 3 })).toBe("Wé\u0000");
  });
});
