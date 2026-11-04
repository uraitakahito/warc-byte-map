import { describe, expect, it } from "vitest";
import { spanLength, tiles } from "../../src/map/span.ts";

describe("spanLength", () => {
  it("終わりから始めを引いた数を返す", () => {
    expect(spanLength({ start: 1851, end: 2345 })).toBe(494);
  });
});

describe("tiles", () => {
  const parent = { start: 10, end: 20 };

  it("隙間も重なりも無く並ぶ子は、親を覆う（長さ 0 の子を挟んでもよい）", () => {
    expect(
      tiles(parent, [
        { start: 10, end: 12 },
        { start: 12, end: 12 },
        { start: 12, end: 20 },
      ]),
    ).toBe(true);
  });

  it("子が無ければ、長さ 0 の親だけを覆う", () => {
    expect(tiles({ start: 5, end: 5 }, [])).toBe(true);
    expect(tiles(parent, [])).toBe(false);
  });

  it("子の間に隙間があれば覆わない", () => {
    expect(tiles(parent, [{ start: 10, end: 12 }, { start: 13, end: 20 }])).toBe(false);
  });

  it("子が重なれば覆わない", () => {
    expect(tiles(parent, [{ start: 10, end: 13 }, { start: 12, end: 20 }])).toBe(false);
  });

  it("子が親の始めより前から始まれば覆わない", () => {
    expect(tiles(parent, [{ start: 9, end: 20 }])).toBe(false);
  });

  it("子が親の終わりに届かなくても、越えても覆わない", () => {
    expect(tiles(parent, [{ start: 10, end: 19 }])).toBe(false);
    expect(tiles(parent, [{ start: 10, end: 21 }])).toBe(false);
  });

  it("終わりが始めより前の子は覆わない", () => {
    expect(
      tiles(parent, [
        { start: 10, end: 12 },
        { start: 12, end: 11 },
        { start: 11, end: 20 },
      ]),
    ).toBe(false);
  });
});
