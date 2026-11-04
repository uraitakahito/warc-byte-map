import { describe, expect, it } from "vitest";
import { mapWarc } from "../../src/map/record.ts";
import type { ProblemCode, WarcMap } from "../../src/map/types.ts";
import { BLOCK_LENGTH, asField, buildWarc, withoutProblems, type RecordSpec } from "../support/build-warc.ts";
import { minimalRecords } from "../support/examples.ts";
import { tilingViolations } from "../support/tiling.ts";

const codes = (map: WarcMap): ProblemCode[][] => map.records.map((r) => r.problems.map((p) => p.code));

/** minimalRecords の n 番目を、over で上書きした物に替える。 */
const replaced = (n: number, over: Partial<RecordSpec>): RecordSpec[] =>
  minimalRecords.map((spec, i) => (i === n ? { ...spec, ...over } : spec));

describe("mapWarc: 正しい WARC", () => {
  it("4 つの record を、組み立てたとおりの範囲で返し、問題を言わない", () => {
    const built = buildWarc(minimalRecords);
    const map = mapWarc(built.bytes);
    expect(withoutProblems(map.records)).toEqual(built.records);
    expect(codes(map)).toEqual([[], [], [], []]);
    expect(map.rest).toBeUndefined();
    expect(tilingViolations(map, built.bytes.length)).toEqual([]);
  });

  it("payload が LF LF で終わっても、block は Content-Length で区切る", () => {
    const built = buildWarc(minimalRecords);
    const response = mapWarc(built.bytes).records[2]!;
    expect(response.block).toEqual(built.records[2]!.block);
    expect(Array.from(built.bytes.subarray(response.block.end - 2, response.separator.end))).toEqual([
      0x0a, 0x0a, 0x0d, 0x0a, 0x0d, 0x0a,
    ]);
  });

  it("WARC/1.0 の版の行も、そのままの範囲で返す", () => {
    const built = buildWarc(replaced(0, { version: "WARC/1.0" }));
    const map = mapWarc(built.bytes);
    expect(withoutProblems(map.records)).toEqual(built.records);
    expect(codes(map)[0]).toEqual([]);
  });

  it("コロンの後に空白が無い欄は、長さ 0 の空白を持つ", () => {
    const built = buildWarc([{ lines: [{ name: "Content-Length", value: BLOCK_LENGTH, space: "" }], block: "abc" }]);
    const field = asField(mapWarc(built.bytes).records[0]!.fields[0]);
    expect(field).toEqual(built.records[0]!.fields[0]);
    expect(field.space.end - field.space.start).toBe(0);
  });

  it("Content-Length の名前の大文字小文字を区別しない", () => {
    const built = buildWarc([{ lines: [{ name: "content-LENGTH", value: BLOCK_LENGTH }], block: "abc" }]);
    const map = mapWarc(built.bytes);
    expect(withoutProblems(map.records)).toEqual(built.records);
    expect(codes(map)).toEqual([[]]);
  });

  it("空の file は、record も rest も無い", () => {
    expect(mapWarc(new Uint8Array())).toEqual({ records: [], problems: [] });
  });
});

describe("mapWarc: 行の形", () => {
  it("LF だけの行も読み、最初のその改行を lf-line-ending として指す", () => {
    const lines = minimalRecords[0]!.lines.map((line, i) => (i === 2 ? { ...line, eol: "\n" as const } : line));
    const built = buildWarc([{ ...minimalRecords[0]!, lines }]);
    const record = mapWarc(built.bytes).records[0]!;
    expect(withoutProblems([record])).toEqual(built.records);
    const eol = built.records[0]!.fields[2]!.eol;
    expect(record.problems).toEqual([{ code: "lf-line-ending", span: eol }]);
  });

  it("LF だけで書いた record は、LF LF で閉じる", () => {
    const lf = "\n" as const;
    const built = buildWarc([
      {
        versionEol: lf,
        lines: [
          { name: "WARC-Type", value: "resource", eol: lf },
          { name: "Content-Length", value: BLOCK_LENGTH, eol: lf },
        ],
        blankEol: lf,
        block: "x\n\ny",
        separator: "\n\n",
      },
      minimalRecords[0]!,
    ]);
    const map = mapWarc(built.bytes);
    expect(withoutProblems(map.records)).toEqual(built.records);
    expect(codes(map)).toEqual([["lf-line-ending"], []]);
  });

  it("折り返しの行を、前の欄の続きとして範囲に持ち、folded-line を言う", () => {
    const built = buildWarc([
      {
        lines: [
          { name: "WARC-Type", value: "resource" },
          { name: "WARC-Target-URI", value: "http://example.test/a", folded: [{ indent: " \t", value: "b" }] },
          { name: "Content-Length", value: BLOCK_LENGTH },
        ],
        block: "z",
      },
    ]);
    const record = mapWarc(built.bytes).records[0]!;
    expect(withoutProblems([record])).toEqual(built.records);
    const target = asField(built.records[0]!.fields[1]);
    expect(record.problems).toEqual([{ code: "folded-line", span: target.folded[0]!.line }]);
  });

  it("欄として読めない行を残し、bad-field-line を言う", () => {
    const built = buildWarc([
      {
        lines: [
          { unreadable: " begins with a space" },
          { name: "WARC-Type", value: "resource" },
          { unreadable: "no colon here" },
          { unreadable: "bad name: value" },
          { unreadable: ": no name" },
          { name: "Content-Length", value: BLOCK_LENGTH },
        ],
        block: "z",
      },
    ]);
    const record = mapWarc(built.bytes).records[0]!;
    expect(withoutProblems([record])).toEqual(built.records);
    expect(record.problems.map((p) => p.code)).toEqual(["bad-field-line", "bad-field-line", "bad-field-line", "bad-field-line"]);
  });
});

describe("mapWarc: Content-Length と区切り", () => {
  const blockLength = (n: number): number => {
    const built = buildWarc(minimalRecords);
    return built.records[n]!.block.end - built.records[n]!.block.start;
  };
  const withLength = (n: number, value: string): RecordSpec[] =>
    replaced(n, {
      lines: minimalRecords[n]!.lines.map((line) => ("name" in line && line.name === "Content-Length" ? { ...line, value } : line)),
    });

  it("短い Content-Length は、次の record の頭で区切り直し、宣言と実際を返す", () => {
    const actual = blockLength(1);
    const built = buildWarc(withLength(1, String(actual - 5)));
    const map = mapWarc(built.bytes);
    expect(withoutProblems(map.records)).toEqual(built.records);
    const contentLength = asField(built.records[1]!.fields.at(-1));
    expect(map.records[1]!.problems).toEqual([
      { code: "content-length-mismatch", span: contentLength.value, declared: actual - 5, actual },
    ]);
  });

  it("長い Content-Length も、途中の record なら次の record の頭で、最後の record なら file の終わりで区切り直す", () => {
    for (const n of [1, 3]) {
      const actual = blockLength(n);
      const built = buildWarc(withLength(n, String(actual + 7)));
      const map = mapWarc(built.bytes);
      expect(withoutProblems(map.records)).toEqual(built.records);
      expect(map.records[n]!.problems.map((p) => [p.code, p.declared, p.actual])).toEqual([
        ["content-length-mismatch", actual + 7, actual],
      ]);
    }
  });

  it("Content-Length が無い・数でないときも、次の record の頭で区切り直す", () => {
    const missing = replaced(1, { lines: minimalRecords[1]!.lines.filter((line) => !("name" in line && line.name === "Content-Length")) });
    for (const [specs, code] of [
      [missing, "content-length-missing"],
      [withLength(1, "12a"), "content-length-form"],
      [withLength(1, "99999999999999999999"), "content-length-form"],
    ] as const) {
      const built = buildWarc(specs);
      const map = mapWarc(built.bytes);
      expect(withoutProblems(map.records)).toEqual(built.records);
      expect(codes(map)).toEqual([[], [code], [], []]);
    }
  });

  it("最後の record に区切りが無ければ、長さ 0 の区切りを返し、no-terminator を言う", () => {
    const built = buildWarc(replaced(3, { separator: "" }));
    const map = mapWarc(built.bytes);
    expect(withoutProblems(map.records)).toEqual(built.records);
    const separator = built.records[3]!.separator;
    expect(separator.start).toBe(separator.end);
    expect(map.records[3]!.problems).toEqual([{ code: "no-terminator", span: separator }]);
  });
});

describe("mapWarc: record として読めない bytes", () => {
  it("file の頭が版の行でなければ、全部を rest にして、no-version-line を言う", () => {
    const bytes = new TextEncoder().encode("HTTP/1.1 200 OK\r\n\r\n");
    expect(mapWarc(bytes)).toEqual({
      records: [],
      rest: { start: 0, end: bytes.length },
      problems: [{ code: "no-version-line", span: { start: 0, end: bytes.length } }],
    });
  });

  it("WARC/ で始まっても版の行の形でなければ、そこから先を rest にする", () => {
    const built = buildWarc(minimalRecords.slice(0, 2), "WARC/one\r\nWARC-Type: resource\r\n\r\n");
    const map = mapWarc(built.bytes);
    expect(withoutProblems(map.records)).toEqual(built.records);
    expect(codes(map)).toEqual([[], []]);
    expect(map.rest).toEqual(built.trailing);
    expect(map.problems).toEqual([{ code: "no-version-line", span: built.trailing }]);
  });

  it("header が空行で閉じずに file が終われば、その record の頭から rest にして、no-blank-line を言う", () => {
    for (const trailing of ["WARC/1.1\r\nWARC-Type: resource\r\n", "WARC/1.1"]) {
      const built = buildWarc(minimalRecords.slice(0, 1), trailing);
      const map = mapWarc(built.bytes);
      expect(withoutProblems(map.records)).toEqual(built.records);
      expect(map.problems).toEqual([{ code: "no-blank-line", span: built.trailing }]);
    }
  });

  it("区切りの後が WARC/ でなければ Content-Length を疑い、後ろの bytes も block に入れる（wacz-validator と同じ規則）", () => {
    const built = buildWarc(minimalRecords.slice(0, 2), "HTTP/1.1 200 OK\r\n\r\n");
    const record = mapWarc(built.bytes).records[1]!;
    const expected = built.records[1]!;
    const declared = expected.block.end - expected.block.start;
    expect(record.block).toEqual({ start: expected.block.start, end: built.bytes.length - 4 });
    expect(record.separator).toEqual({ start: built.bytes.length - 4, end: built.bytes.length });
    expect(record.problems.map((p) => [p.code, p.declared, p.actual])).toEqual([
      ["content-length-mismatch", declared, built.bytes.length - 4 - expected.block.start],
    ]);
  });
});

/** 種を決めた擬似乱数（mulberry32）。同じ種なら、何度回しても同じ壊し方になる。 */
const random = (seed: number) => {
  let s = seed;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe("mapWarc: どんな bytes でも", () => {
  it("壊した WARC でも落ちず、record と rest が file を、各部が親を、隙間も重なりも無く覆う", () => {
    const base = buildWarc(minimalRecords).bytes;
    const next = random(20261105);
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
    const interesting = [0x0d, 0x0a, 0x20, 0x09, 0x3a, 0x30, 0x39, 0x57, 0x00, 0xff];
    for (let round = 0; round < 500; round++) {
      let bytes = Array.from(base);
      for (let k = 0; k < 1 + Math.floor(next() * 4); k++) {
        const at = Math.floor(next() * bytes.length);
        const op = pick(["set", "insert", "delete", "truncate"] as const);
        if (op === "set") bytes[at] = pick(interesting);
        else if (op === "insert") bytes.splice(at, 0, pick(interesting));
        else if (op === "delete") bytes.splice(at, 1);
        else bytes = bytes.slice(0, at);
      }
      const input = Uint8Array.from(bytes);
      const map = mapWarc(input);
      expect(tilingViolations(map, input.length), `round ${String(round)}`).toEqual([]);
    }
  });
});
