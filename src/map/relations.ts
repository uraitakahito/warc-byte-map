/**
 * record どうしのつながり（ほかの record の WARC-Record-ID を値に持つ欄）を、file の中で引く。
 *
 * - WARC-Concurrent-To（§5.7。繰り返してよい）・WARC-Refers-To（§5.11）・WARC-Warcinfo-ID（§5.16）・
 *   WARC-Segment-Origin-ID（§5.21）
 * - 相手が同じ file に無ければ target は無い（別の file の record を指すこともある）
 */
import { fieldText, fieldsNamed, lastField } from "./fields.ts";
import type { FieldMap, RecordMap } from "./types.ts";

export const RELATION_FIELDS = ["WARC-Concurrent-To", "WARC-Refers-To", "WARC-Warcinfo-ID", "WARC-Segment-Origin-ID"] as const;

export interface Relation {
  readonly name: (typeof RELATION_FIELDS)[number];
  readonly field: FieldMap;
  readonly value: string;
  /** 指す先の record の順番（同じ file に在るときだけ）。 */
  readonly target?: number;
}

export interface Relations {
  /** record ごとに、その record が指す先。 */
  readonly outgoing: readonly (readonly Relation[])[];
  /** record ごとに、その record を指す record（from）と欄の名前。 */
  readonly incoming: readonly (readonly { readonly name: Relation["name"]; readonly from: number }[])[];
}

export const relationsOf = (bytes: Uint8Array, records: readonly RecordMap[]): Relations => {
  const byId = new Map<string, number>();
  records.forEach((record, index) => {
    const id = lastField(bytes, record.fields, "WARC-Record-ID");
    if (id !== undefined && !byId.has(fieldText(bytes, id))) byId.set(fieldText(bytes, id), index);
  });
  const outgoing = records.map((record) =>
    RELATION_FIELDS.flatMap((name) =>
      fieldsNamed(bytes, record.fields, name).map((field): Relation => {
        const value = fieldText(bytes, field);
        const target = byId.get(value);
        return { name, field, value, ...(target !== undefined && { target }) };
      }),
    ),
  );
  const incoming = records.map((): { name: Relation["name"]; from: number }[] => []);
  outgoing.forEach((relations, from) => {
    for (const r of relations) if (r.target !== undefined) incoming[r.target]?.push({ name: r.name, from });
  });
  return { outgoing, incoming };
};
