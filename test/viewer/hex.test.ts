import { describe, expect, it } from "vitest";
import { glyph, hex2, visibleRanges } from "../../src/viewer/hex.ts";

describe("visibleRanges", () => {
  it("上限までの record は全部を描く", () => {
    expect(visibleRanges({ start: 10, end: 110 }, 100, 20)).toEqual([{ start: 10, end: 110 }]);
  });

  it("上限を越える record は、頭と尻だけを描く", () => {
    expect(visibleRanges({ start: 10, end: 111 }, 100, 20)).toEqual([
      { start: 10, end: 90 },
      { start: 91, end: 111 },
    ]);
  });
});

describe("glyph と hex2", () => {
  it("CR・LF・空白・タブは記号で、印字できない octet は点で描く", () => {
    expect([0x0d, 0x0a, 0x20, 0x09, 0x41, 0x00, 0x7f, 0xe3].map(glyph).join("")).toBe("␍␊·⇥A...");
  });

  it("octet を 2 桁の 16 進にする", () => {
    expect([0x0, 0x0a, 0xff].map(hex2)).toEqual(["00", "0a", "ff"]);
  });
});
