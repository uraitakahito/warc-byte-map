/**
 * いま見ている物を URL の hash に書き、そのまま link にできるようにする。
 *
 *   #src=<WARC の URL>&rec=<record の始めの位置>&part=<部分の id>&bytes=<始め>-<終わり>&lang=ja
 *
 * 読めない値は捨てる（壊れた link でも、読める所までは開く）。
 */
import type { Span } from "../map/span.ts";
import type { Lang } from "./terms.ts";

export interface ViewState {
  readonly src?: string;
  readonly rec?: number;
  readonly part?: string;
  readonly bytes?: Span;
  readonly lang?: Lang;
}

const offset = (text: string | null): number | undefined => (text !== null && /^\d+$/.test(text) ? Number(text) : undefined);

const range = (text: string | null): Span | undefined => {
  const m = text === null ? null : /^(\d+)-(\d+)$/.exec(text);
  if (m === null) return undefined;
  const start = Number(m[1]);
  const end = Number(m[2]);
  return start <= end ? { start, end } : undefined;
};

export const parseHash = (hash: string): ViewState => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const src = params.get("src");
  const rec = offset(params.get("rec"));
  const part = params.get("part");
  const bytes = range(params.get("bytes"));
  const lang = params.get("lang");
  return {
    ...(src !== null && src !== "" && { src }),
    ...(rec !== undefined && { rec }),
    ...(part !== null && part !== "" && { part }),
    ...(bytes !== undefined && { bytes }),
    ...((lang === "ja" || lang === "en") && { lang }),
  };
};

export const formatHash = (state: ViewState): string => {
  const params = new URLSearchParams();
  if (state.src !== undefined) params.set("src", state.src);
  if (state.rec !== undefined) params.set("rec", String(state.rec));
  if (state.part !== undefined) params.set("part", state.part);
  if (state.bytes !== undefined) params.set("bytes", `${String(state.bytes.start)}-${String(state.bytes.end)}`);
  if (state.lang !== undefined) params.set("lang", state.lang);
  const text = params.toString();
  return text === "" ? "" : `#${text}`;
};
