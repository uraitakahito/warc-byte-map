import { describe, expect, it } from "vitest";
import { fieldText, lastField } from "../../src/map/fields.ts";
import { mapWarc } from "../../src/map/record.ts";
import { BLOCK_LENGTH, asField, buildWarc } from "../support/build-warc.ts";

describe("fieldText", () => {
  it("値の前後の空白とタブを落とし、折り返しを空白 1 つでつなぐ", () => {
    const built = buildWarc([
      {
        lines: [{ name: "X-Note", value: "a \t", folded: [{ indent: "\t", value: "b " }, { indent: " ", value: "c" }] }],
      },
    ]);
    expect(fieldText(built.bytes, asField(built.records[0]!.fields[0]))).toBe("a \t b  c");
  });
});

describe("lastField", () => {
  const built = buildWarc([
    {
      lines: [
        { name: "Content-Length", value: "1" },
        { unreadable: "content-length 2" },
        { name: "content-length", value: "3" },
        { name: "WARC-Type", value: "resource" },
      ],
    },
  ]);
  const fields = built.records[0]!.fields;

  it("名前の大文字小文字を区別せず、最後の欄を返す", () => {
    expect(lastField(built.bytes, fields, "CONTENT-LENGTH")).toEqual(fields[2]);
  });

  it("無ければ undefined を返す", () => {
    expect(lastField(built.bytes, fields, "WARC-Date")).toBeUndefined();
  });
});

describe("mapWarc と Content-Length の繰り返し", () => {
  it("同じ名前が 2 つあれば、後の値で block を区切る", () => {
    const built = buildWarc([
      { lines: [{ name: "Content-Length", value: "1" }, { name: "Content-Length", value: BLOCK_LENGTH }], block: "abc" },
    ]);
    expect(mapWarc(built.bytes).records[0]!.problems).toEqual([]);
  });
});
