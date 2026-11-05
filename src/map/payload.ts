/**
 * payload の在り処を、record の type ごとの定め（WARC 1.1 の §6）で決める。
 *
 * - response・request（http・https）: RFC 2616 の entity-body。entity-body は message-body から
 *   Transfer-Encoding を解いた物（RFC 2616 の §7.2）なので、chunked なら chunk の data の並び。
 *   Content-Encoding（gzip など）は entity の一部なので解かない
 * - resource・conversion: block 全体
 * - revisit: 元の record の payload。segment（WARC-Segment-Number を持つ record）: logical record の payload
 * - warcinfo・metadata・ほかの scheme: 定めが無い
 */
import { fieldText, lastField } from "./fields.ts";
import type { HttpRead } from "./http.ts";
import type { Span } from "./span.ts";
import type { HeaderLine, Payload } from "./types.ts";

const typeOf = (bytes: Uint8Array, fields: readonly HeaderLine[]): string => {
  const field = lastField(bytes, fields, "WARC-Type");
  return field === undefined ? "" : fieldText(bytes, field).toLowerCase();
};

/** WARC-Target-URI の scheme が http か https か（WARC/1.0 の <…> 囲みも読む）。 */
const isHttpTarget = (bytes: Uint8Array, fields: readonly HeaderLine[]): boolean => {
  const field = lastField(bytes, fields, "WARC-Target-URI");
  return field !== undefined && /^<?https?:/i.test(fieldText(bytes, field));
};

/** httpRead は、block が application/http のときだけ渡す（mapHttp の結果）。 */
export const payloadOf = (bytes: Uint8Array, fields: readonly HeaderLine[], block: Span, httpRead: HttpRead | undefined): Payload => {
  const type = typeOf(bytes, fields);
  if (lastField(bytes, fields, "WARC-Segment-Number") !== undefined || type === "continuation") {
    return { kind: "elsewhere", reason: "segment" };
  }
  if (type === "revisit") return { kind: "elsewhere", reason: "revisit" };
  if (type === "resource" || type === "conversion") return { kind: "here", spans: [block] };
  if ((type === "response" || type === "request") && httpRead !== undefined && isHttpTarget(bytes, fields)) {
    const { http } = httpRead;
    if (http === undefined || httpRead.problems.some((p) => p.code === "chunked-malformed")) return { kind: "unreadable" };
    return { kind: "here", spans: http.chunked === undefined ? [http.entity] : http.chunked.chunks.map((c) => c.data) };
  }
  return { kind: "not-defined" };
};
