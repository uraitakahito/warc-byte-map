/**
 * viewer の頁。WARC を読み手（src/map/）で地図にし、record の一覧・部分の木・hex を描く。
 *
 * 部分の木の行と hex の octet は互いに強調し合う。いま見ている物は URL の hash に書く
 * （hash.ts）ので、その URL がそのまま link になる。
 */
import {
  base32,
  digestChecks,
  digestMatches,
  fieldText,
  gunzipMembers,
  isGzip,
  lastField,
  mapWarc,
  relationsOf,
  type DigestCheck,
  type Inflated,
  type MemberMap,
  type Relations,
} from "../map/index.ts";
import { deepestAt, findPart, partTree, type PartKind, type PartNode } from "../map/parts.ts";
import type { Span } from "../map/span.ts";
import type { FieldMap, RecordMap, WarcMap } from "../map/types.ts";
import { formatHash, parseHash, type ViewState } from "./hash.ts";
import { digestOf } from "./digest.ts";
import { glyph, hex2, visibleRanges } from "./hex.ts";
import {
  FIELD_SECTIONS,
  HTTP_SECTIONS,
  PAYLOAD_SECTION,
  PROBLEMS,
  SPEC_PAGE,
  TERMS,
  sectionUrl,
  type Lang,
  type Section,
} from "./terms.ts";

/** 開ける file の上限。読み手は 100 MiB を 0.2 秒で読む（2026-11-05 に測った）ので、決めるのはメモリ。 */
const MAX_BYTES = 256 * 1024 * 1024;
/** 一覧に並べる record の上限。行を全部作ると、大きな file で頁が重くなる。 */
const MAX_LISTED = 5000;
const PRIMER = "https://uraitakahito.github.io/warc-specifications/primers/web-archive-formats/";
const EXAMPLE = `${PRIMER}hello-world.warc`;
/** .warc.gz を解いた長さの上限（member の trailer の ISIZE で、解く前に見積もる）。 */
const MAX_INFLATED = 512 * 1024 * 1024;
/** 既定で畳む節。名前・コロン・値などの葉が多く、開いたままだとカードが長くなる。 */
const FOLDABLE: ReadonlySet<PartKind> = new Set(["version", "field", "folded", "unreadable", "http-start-line", "http-field", "chunk"]);
/** application/http の block の中の節。§ は record の type で変わる（request は §6.5.2）。 */
const HTTP_KINDS: ReadonlySet<PartKind> = new Set(["http-head", "http-start-line", "http-start-text", "http-field", "http-blank", "entity"]);

const UI = {
  tagline: { ja: "WARC の仕様の用語が、file のどの byte を指すかを見る", en: "See which bytes of a WARC file each term of the specification refers to" },
  example: { ja: "例を開く: hello-world.warc", en: "Open the example: hello-world.warc" },
  exampleNote: {
    ja: "IIPC の primer の例（WARC/1.0・6 つの record）。fork の頁から読む。",
    en: "The example from the IIPC primer (WARC/1.0, six records), read from the fork's site.",
  },
  exampleTypes: { ja: "例を開く: types.warc（8 つの type）", en: "Open the example: types.warc (all eight types)" },
  exampleTypesNote: {
    ja: "warc-byte-map が書いた WARC/1.1 の例。chunked の response を 2 つ（payload digest の 2 つの読み方）と、2 つに割った record も入れた。",
    en: "A WARC/1.1 example written for warc-byte-map, with two chunked responses (both readings of the payload digest) and a record split into two segments.",
  },
  exampleTypesGz: { ja: "同じ例を .warc.gz で開く（1 record 1 member）", en: "Open the same example as .warc.gz (one member per record)" },
  relations: { ja: "つながり", en: "Related records" },
  notInFile: { ja: "この file に無い", en: "Not in this file" },
  pointedBy: { ja: "ここを指す record", en: "Pointed to by" },
  openFile: { ja: "手元の WARC を開く（.warc・.warc.gz）", en: "Open a local WARC (.warc, .warc.gz)" },
  dropHint: { ja: "file をこの頁に落としても開ける。手元の file は送られない。", en: "You can also drop a file on this page. Local files are not uploaded." },
  loading: { ja: "読んでいる…", en: "Loading…" },
  tooLarge: { ja: "大きすぎる（256 MiB まで）。", en: "Too large (up to 256 MiB)." },
  gzipBroken: { ja: "gzip の member を解けなかった", en: "Could not inflate a gzip member" },
  tooLargeInflated: { ja: "解くと大きすぎる（512 MiB まで）。", en: "Too large once inflated (up to 512 MiB)." },
  members: { ja: "member", en: "gzip members" },
  inflatedTo: { ja: "解いて", en: "inflated to" },
  inflatedNote: { ja: "位置は解いた流れの中の位置", en: "Offsets are in the inflated stream" },
  inFile: { ja: "file の中", en: "in the file" },
  failed: { ja: "読めなかった", en: "Could not load" },
  records: { ja: "record", en: "Records" },
  listCut: { ja: "件目まで並べた", en: "listed" },
  rest: { ja: "record として読めない残り", en: "Bytes not readable as records" },
  problems: { ja: "見つかった問題", en: "Problems found" },
  copy: { ja: "link を写す", en: "Copy link" },
  copied: { ja: "写した", en: "Copied" },
  copyFailed: { ja: "写せなかった", en: "Could not copy" },
  octets: { ja: "octet", en: "octets" },
  none: { ja: "（無し）", en: "(none)" },
  omitted: { ja: "octet を省いた", en: "octets omitted" },
  spec: { ja: "注釈つきの WARC 1.1", en: "Annotated WARC 1.1" },
  docs: { ja: "ドキュメント", en: "Documentation" },
  other: { ja: "English", en: "日本語" },
  payload: { ja: "payload", en: "Payload" },
  payloadHere: { ja: "この record の中", en: "In this record" },
  payloadRanges: { ja: "個の範囲", en: "ranges" },
  payloadRevisit: { ja: "この record には無い（revisit の元の record の物）", en: "Not in this record (it belongs to the record this revisit refers to)" },
  payloadSegment: { ja: "この record には無い（segment に割った logical record の物）", en: "Not in this record (it belongs to the segmented logical record)" },
  payloadNotDefined: { ja: "この type の payload を、仕様は定めていない", en: "The specification defines no payload for this type" },
  payloadUnreadable: { ja: "block を読めないので、範囲を決められない", en: "The block cannot be read, so the payload cannot be located" },
  show: { ja: "強調", en: "Highlight" },
  computing: { ja: "計算している…", en: "Computing…" },
  match: { ja: "一致", en: "Matches" },
  mismatch: { ja: "不一致。計算した値", en: "Does not match. Computed" },
  matchRaw: { ja: "chunk のまま（Transfer-Encoding を解かない entity）に掛けると一致する", en: "Matches when computed over the entity as transferred (chunked)" },
  noAlgorithm: { ja: "この算法は WebCrypto に無いので計算できない", en: "This algorithm is not available in WebCrypto" },
  badDigest: { ja: "値の形が「算法:値」でない", en: "The value is not in the form algorithm:value" },
  nothingHere: { ja: "掛ける bytes がこの record に無い", en: "No bytes in this record to compute over" },
  reproduce: { ja: "再現", en: "Reproduce" },
  back: { ja: "ほかの file を開く", en: "Open another file" },
} as const;

const utf8 = new TextDecoder("utf-8");

interface Loaded {
  /** 圧縮していない WARC。.warc.gz なら、解いた流れ。 */
  readonly bytes: Uint8Array;
  readonly map: WarcMap;
  readonly name: string;
  readonly relations: Relations;
  /** .warc.gz のとき: member と、圧縮した file の大きさ。 */
  readonly gzip?: { readonly members: readonly MemberMap[]; readonly size: number; readonly error?: Inflated["error"] };
}

/** record の範囲に重なる member。 */
const membersOf = (record: RecordMap): readonly MemberMap[] =>
  loaded?.gzip?.members.filter((m) => m.inflated.start < record.record.end && record.record.start < m.inflated.end) ?? [];

const memberText = (m: MemberMap): string => `member #${String(m.index)}: ${tr(UI.inFile)} ${rangeText(m.compressed)}`;

interface Shown {
  readonly record: RecordMap;
  readonly tree: PartNode;
  /** octet の位置 → その octet を描いた hex と text の要素。 */
  readonly cells: Map<number, HTMLElement[]>;
  /** 部分の id → 部分の木の行。 */
  readonly rows: Map<string, HTMLElement>;
}

let view: ViewState = parseHash(location.hash);
let loaded: Loaded | undefined;
let shown: Shown | undefined;
let status: { text: string; error: boolean } | undefined;
/** 強調している範囲（hover と、選んだ物）。payload は範囲が複数になりうる。 */
const lit: Record<"hover" | "sel", readonly Span[]> = { hover: [], sel: [] };

const lang = (): Lang => view.lang ?? (navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en");
const tr = (text: Readonly<Record<Lang, string>>): string => text[lang()];

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
};

const text = (bytes: Uint8Array, span: Span): string => utf8.decode(bytes.subarray(span.start, span.end));
const length = (span: Span): number => span.end - span.start;
const rangeText = (span: Span): string => `${String(span.start)}–${String(span.end)}（${String(length(span))}）`;
const clip = (s: string, n = 72): string => (s.length > n ? `${s.slice(0, n)}…` : s);

const writeHash = (): void => {
  history.replaceState(null, "", `${location.pathname}${location.search}${formatHash(view)}`);
};

/** view から、選んだ部分と範囲を外す（exactOptionalPropertyTypes のもとで、鍵ごと消す）。 */
const withoutSelection = ({ part: _part, bytes: _bytes, ...rest }: ViewState): ViewState => rest;

// ── 強調 ──

const paint = (which: "hover" | "sel", spans: readonly Span[]): void => {
  const cells = shown?.cells;
  if (cells === undefined) return;
  for (const before of lit[which]) {
    for (let o = before.start; o < before.end; o++) cells.get(o)?.forEach((c) => { c.classList.remove(which); });
  }
  lit[which] = spans;
  for (const span of spans) {
    for (let o = span.start; o < span.end; o++) cells.get(o)?.forEach((c) => { c.classList.add(which); });
  }
};

/** 畳んだ祖先の中の行なら、いちばん外の畳んだ祖先の行（見えている行）を返す。 */
const visibleRow = (row: HTMLElement): HTMLElement => {
  let visible = row;
  for (let li = row.closest("li")?.parentElement?.closest("li"); li; li = li.parentElement?.closest("li")) {
    if (li.classList.contains("foldable") && !li.classList.contains("open")) visible = li.querySelector<HTMLElement>(":scope > .row") ?? visible;
  }
  return visible;
};

/** 行の祖先の畳みを開く。 */
const reveal = (row: HTMLElement): void => {
  for (let li = row.closest("li")?.parentElement?.closest("li"); li; li = li.parentElement?.closest("li")) li.classList.add("open");
};

const markRow = (which: "hover" | "sel", id: string | undefined): void => {
  shown?.rows.forEach((row) => { row.classList.remove(which); });
  const row = id === undefined ? undefined : shown?.rows.get(id);
  if (row !== undefined) visibleRow(row).classList.add(which);
};

/**
 * hex の pane を、offset の octet が見える所まで送る。pane が自分で送れるとき（3 列）だけ動かし、
 * 頁そのものは送らない（1 列・2 列で頁が飛ばないように）。
 */
const scrollHexTo = (offset: number | undefined): void => {
  const cell = offset === undefined ? undefined : shown?.cells.get(offset)?.[0];
  const pane = cell?.closest<HTMLElement>(".hex");
  if (cell === undefined || pane === null || pane === undefined || pane.scrollHeight <= pane.clientHeight) return;
  const top = cell.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  if (top < pane.scrollTop || top > pane.scrollTop + pane.clientHeight - 24) pane.scrollTop = top - pane.clientHeight / 3;
};

const hover = (node: PartNode | undefined): void => {
  paint("hover", node === undefined ? [] : [node.span]);
  markRow("hover", node?.id);
};

/** 部分を選ぶ。scroll なら、部分の木の行を開いて見える所まで送る（hex や link から選んだとき）。 */
const select = (node: PartNode, scroll = false): void => {
  const row = shown?.rows.get(node.id);
  if (scroll && row !== undefined) {
    reveal(row);
    row.scrollIntoView({ block: "nearest" });
  }
  paint("sel", [node.span]);
  scrollHexTo(node.span.start);
  markRow("sel", node.id);
  view = { ...withoutSelection(view), part: node.id, bytes: node.span };
  writeHash();
};

const selectBytes = (span: Span): void => {
  paint("sel", [span]);
  scrollHexTo(span.start);
  markRow("sel", undefined);
  view = { ...withoutSelection(view), bytes: span };
  writeHash();
};

/** payload の範囲（chunked なら複数）を選ぶ。hash には part=payload と書く。 */
const selectPayload = (): void => {
  const payload = shown?.record.payload;
  const spans = payload?.kind === "here" ? payload.spans : [];
  paint("sel", spans);
  scrollHexTo(spans[0]?.start);
  markRow("sel", undefined);
  view = { ...withoutSelection(view), part: "payload" };
  writeHash();
};

// ── 部分の木 ──

const fieldOf = (record: RecordMap, node: PartNode): FieldMap | undefined => {
  const warc = /^line\.(\d+)$/.exec(node.id)?.[1];
  const http = /^block\.head\.line\.(\d+)$/.exec(node.id)?.[1];
  const line = warc !== undefined ? record.fields[Number(warc)] : http !== undefined ? record.http?.fields[Number(http)] : undefined;
  return line?.kind === "field" ? line : undefined;
};

const recordType = (bytes: Uint8Array, record: RecordMap): string => {
  const field = lastField(bytes, record.fields, "WARC-Type");
  return field === undefined ? "" : fieldText(bytes, field).toLowerCase();
};

const sectionOf = (bytes: Uint8Array, record: RecordMap, node: PartNode): Section | undefined => {
  const field = node.kind === "field" ? fieldOf(record, node) : undefined;
  const named = field === undefined ? undefined : FIELD_SECTIONS[text(bytes, field.name).toLowerCase()];
  if (HTTP_KINDS.has(node.kind)) return recordType(bytes, record) === "request" ? HTTP_SECTIONS.request : HTTP_SECTIONS.response;
  return named ?? TERMS[node.kind].section;
};

const lineEnd = (bytes: Uint8Array, span: Span): string =>
  Array.from(bytes.subarray(span.start, span.end), (b) => (b === 0x0d ? "CR" : b === 0x0a ? "LF" : hex2(b))).join(" ");

const preview = (bytes: Uint8Array, record: RecordMap, node: PartNode): string => {
  switch (node.kind) {
    case "field":
    case "http-field": {
      const field = fieldOf(record, node);
      return field === undefined ? "" : clip(`${text(bytes, field.name)}: ${fieldText(bytes, field)}`);
    }
    case "version":
    case "version-text":
    case "field-name":
    case "field-value":
    case "unreadable":
    case "unreadable-content":
    case "http-start-text":
    case "chunk-size":
      return clip(text(bytes, node.kind === "version" ? record.version.text : node.span).trimEnd());
    case "http-start-line":
      return record.http === undefined ? "" : clip(text(bytes, record.http.startLine.text));
    case "line-end":
    case "separator":
    case "blank":
    case "http-blank":
      return length(node.span) === 0 ? tr(UI.none) : lineEnd(bytes, node.span);
    case "entity": {
      const declared = record.http === undefined ? undefined : lastField(bytes, record.http.fields, "Content-Length");
      const http = declared === undefined || record.http?.chunked !== undefined ? "" : `（HTTP の Content-Length: ${fieldText(bytes, declared)}）`;
      return `${String(length(node.span))} ${tr(UI.octets)}${http}`;
    }
    case "chunk-data":
    case "chunk-end":
      return `${String(length(node.span))} ${tr(UI.octets)}`;
    case "http-head":
    case "chunk":
      return "";
    case "space":
    case "indent":
      return length(node.span) === 0 ? tr(UI.none) : lineEnd(bytes, node.span).replaceAll("20", "SP").replaceAll("09", "HT");
    case "block":
      return `${String(length(node.span))} ${tr(UI.octets)}`;
    case "colon":
    case "record":
    case "header":
    case "folded":
      return "";
  }
};

const treeItem = (bytes: Uint8Array, record: RecordMap, node: PartNode, rows: Map<string, HTMLElement>): HTMLLIElement => {
  const term = TERMS[node.kind];
  const section = sectionOf(bytes, record, node);
  const row = el(
    "div",
    { class: `row k-${node.kind}`, "data-part": node.id },
    el("span", { class: "label", title: term.note === undefined ? "" : tr(term.note) }, tr(term.label)),
    el("span", { class: "preview" }, preview(bytes, record, node)),
    el("span", { class: "range" }, rangeText(node.span)),
    section === undefined ? "" : el("a", { class: "sec", href: sectionUrl(section), target: "_blank", rel: "noopener" }, `§${section.number}`),
  );
  row.addEventListener("mouseenter", () => { hover(node); });
  row.addEventListener("mouseleave", () => { hover(undefined); });
  row.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLAnchorElement)) select(node);
  });
  rows.set(node.id, row);
  const item = el("li", {}, row);
  if (node.children.length === 0) return item;
  if (FOLDABLE.has(node.kind)) {
    item.classList.add("foldable");
    const caret = el("button", { type: "button", class: "caret", "aria-label": "open" }, "▸");
    caret.addEventListener("click", (event) => {
      event.stopPropagation();
      item.classList.toggle("open");
    });
    row.prepend(caret);
  }
  item.append(el("ul", {}, ...node.children.map((c) => treeItem(bytes, record, c, rows))));
  return item;
};

// ── payload と digest ──

/**
 * 1 つの範囲の hash を、手元の shell で計算し直す 1 行。位置は解いた流れの中の位置なので、
 * .warc.gz なら先に gzip -dc で解く（gzip は member をつないだ file も最後まで解く）。
 */
const reproduceLine = (span: Span, algorithm: string, fileName: string, gzip: boolean): HTMLElement => {
  const file = `'${fileName.replaceAll("'", "'\\''")}'`;
  const from = gzip ? `gzip -dc ${file} | tail -c +${String(span.start + 1)}` : `tail -c +${String(span.start + 1)} ${file}`;
  const python = `python3 -c 'import sys,hashlib,base64;print(base64.b32encode(hashlib.new("${algorithm.replace("-", "")}",sys.stdin.buffer.read()).digest()).decode())'`;
  const command = `${from} | head -c ${String(length(span))} | ${python}`;
  return el("div", { class: "repro" }, el("span", {}, tr(UI.reproduce)), el("code", {}, command));
};

type Tone = "ok" | "bad" | "warn" | "";

/** 欄の値と計算した hash を比べた結果の文と色。 */
const digestVerdict = async (bytes: Uint8Array, check: DigestCheck): Promise<[string, Tone]> => {
  if (check.declared === undefined) return [tr(UI.badDigest), "bad"];
  if (check.spans.length === 0) return [tr(UI.nothingHere), ""];
  const hash = await digestOf(check.declared.algorithm, bytes, check.spans);
  if (hash === undefined) return [tr(UI.noAlgorithm), ""];
  if (digestMatches(hash, check.declared.value)) return [`${tr(UI.match)} ✓`, "ok"];
  const raw = check.alternative === undefined ? undefined : await digestOf(check.declared.algorithm, bytes, check.alternative);
  if (raw !== undefined && digestMatches(raw, check.declared.value)) return [tr(UI.matchRaw), "warn"];
  return [`${tr(UI.mismatch)} ${base32(hash)} ✗`, "bad"];
};

const digestRow = (bytes: Uint8Array, check: DigestCheck, fileName: string): HTMLElement => {
  const section = FIELD_SECTIONS[check.name.toLowerCase()];
  const result = el("span", { class: "result" }, tr(UI.computing));
  const show = el("button", { type: "button" }, tr(UI.show));
  show.addEventListener("click", () => {
    const block = shown === undefined ? undefined : findPart(shown.tree, "block");
    if (check.name === "WARC-Payload-Digest") selectPayload();
    else if (block !== undefined) select(block, true);
  });
  const row = el(
    "div",
    { class: "pd" },
    el("span", { class: "label" }, check.name),
    el("code", {}, text(bytes, check.field.value)),
    result,
    check.spans.length > 0 ? show : "",
    section === undefined ? "" : el("a", { class: "sec", href: sectionUrl(section), target: "_blank", rel: "noopener" }, `§${section.number}`),
  );
  const [only] = check.spans;
  if (check.spans.length === 1 && only !== undefined && check.declared !== undefined) {
    row.append(reproduceLine(only, check.declared.algorithm, fileName, loaded?.gzip !== undefined));
  }
  digestVerdict(bytes, check).then(
    ([message, tone]) => {
      result.textContent = message;
      result.className = `result ${tone}`;
    },
    (error: unknown) => {
      result.textContent = error instanceof Error ? error.message : String(error);
    },
  );
  return row;
};

/** payload の在り処と、2 つの digest（在る物だけ）の区画。 */
const payloadSection = (bytes: Uint8Array, record: RecordMap, fileName: string): HTMLElement => {
  const p = record.payload;
  const total = p.kind === "here" ? p.spans.reduce((n, s) => n + length(s), 0) : 0;
  const what =
    p.kind === "here"
      ? `${tr(UI.payloadHere)}: ${String(total)} ${tr(UI.octets)}${p.spans.length > 1 ? `（${String(p.spans.length)} ${tr(UI.payloadRanges)}）` : ""}`
      : p.kind === "elsewhere"
        ? tr(p.reason === "revisit" ? UI.payloadRevisit : UI.payloadSegment)
        : tr(p.kind === "not-defined" ? UI.payloadNotDefined : UI.payloadUnreadable);
  const show = el("button", { type: "button" }, tr(UI.show));
  show.addEventListener("click", () => { selectPayload(); });
  return el(
    "div",
    { class: "payload" },
    el(
      "div",
      { class: "pd" },
      el("span", { class: "label" }, tr(UI.payload)),
      el("span", {}, what),
      p.kind === "here" ? show : "",
      el("a", { class: "sec", href: sectionUrl(PAYLOAD_SECTION), target: "_blank", rel: "noopener" }, `§${PAYLOAD_SECTION.number}`),
    ),
    ...digestChecks(bytes, record).map((check) => digestRow(bytes, check, fileName)),
  );
};

/** つながりの欄（ほかの record を指す欄）と、ここを指す record。相手が同じ file に在れば開ける。 */
const relationsSection = (bytes: Uint8Array, record: RecordMap): HTMLElement | "" => {
  if (loaded === undefined) return "";
  const { map, relations } = loaded;
  const outgoing = relations.outgoing[record.index] ?? [];
  const incoming = relations.incoming[record.index] ?? [];
  if (outgoing.length === 0 && incoming.length === 0) return "";
  const go = (index: number): HTMLElement => {
    const target = map.records[index];
    const button = el("button", { type: "button" }, `#${String(index)} ${target === undefined ? "" : recordLabel(bytes, target)}`);
    button.addEventListener("click", () => {
      if (target !== undefined) pickRecord(target);
    });
    return button;
  };
  const rows = [
    ...outgoing.map((r) => {
      const section = FIELD_SECTIONS[r.name.toLowerCase()];
      return el(
        "div",
        { class: "pd" },
        el("span", { class: "label" }, r.name),
        r.target === undefined ? el("span", { class: "note" }, `${clip(r.value, 60)}（${tr(UI.notInFile)}）`) : go(r.target),
        section === undefined ? "" : el("a", { class: "sec", href: sectionUrl(section), target: "_blank", rel: "noopener" }, `§${section.number}`),
      );
    }),
    ...incoming.map((r) => el("div", { class: "pd" }, el("span", { class: "label" }, tr(UI.pointedBy)), go(r.from), el("span", { class: "note" }, r.name))),
  ];
  return el("div", { class: "payload" }, el("h3", {}, tr(UI.relations)), ...rows);
};

// ── hex ──

const hexPane = (bytes: Uint8Array, record: RecordMap, tree: PartNode, cells: Map<number, HTMLElement[]>): HTMLElement => {
  const pane = el("div", { class: "hex" });
  visibleRanges(record.record).forEach((range, i, all) => {
    if (i > 0) {
      const gap = range.start - (all[i - 1]?.end ?? range.start);
      pane.append(el("div", { class: "gap" }, `… ${String(gap)} ${tr(UI.omitted)} …`));
    }
    for (let rowStart = range.start - (range.start % 16); rowStart < range.end; rowStart += 16) {
      const hexCol = el("span", { class: "h" });
      const textCol = el("span", { class: "t" });
      for (let o = rowStart; o < rowStart + 16; o++) {
        const b = bytes[o];
        if (o < range.start || o >= range.end || b === undefined) {
          hexCol.append(el("span", { class: "pad" }, "  "));
          textCol.append(el("span", { class: "pad" }, " "));
          continue;
        }
        const h = el("span", { "data-o": String(o) }, hex2(b));
        const t = el("span", { "data-o": String(o) }, glyph(b));
        cells.set(o, [h, t]);
        hexCol.append(h);
        textCol.append(t);
      }
      pane.append(el("div", { class: "line" }, el("span", { class: "o" }, rowStart.toString(16).padStart(8, "0")), hexCol, textCol));
    }
  });
  const at = (event: Event): PartNode | undefined => {
    const o = event.target instanceof HTMLElement ? event.target.dataset["o"] : undefined;
    return o === undefined ? undefined : deepestAt(tree, Number(o));
  };
  pane.addEventListener("mouseover", (event) => { hover(at(event)); });
  pane.addEventListener("mouseleave", () => { hover(undefined); });
  pane.addEventListener("click", (event) => {
    const node = at(event);
    if (node !== undefined) select(node, true);
  });
  return pane;
};

// ── 画面 ──

const recordLabel = (bytes: Uint8Array, record: RecordMap): string => {
  const type = lastField(bytes, record.fields, "WARC-Type");
  const target = lastField(bytes, record.fields, "WARC-Target-URI");
  return [type, target].map((f) => (f === undefined ? "" : clip(fieldText(bytes, f), 48))).filter((s) => s !== "").join("  ");
};

const showRecord = (record: RecordMap): void => {
  if (loaded === undefined) return;
  const { bytes } = loaded;
  const tree = partTree(record);
  const cells = new Map<number, HTMLElement[]>();
  const rows = new Map<string, HTMLElement>();
  lit.hover = [];
  lit.sel = [];

  const problems = record.problems.map((p) => {
    const item = el("li", {}, el("span", { class: "range" }, rangeText(p.span)), " ", tr(PROBLEMS[p.code]));
    item.addEventListener("click", () => { selectBytes(p.span); });
    return item;
  });
  const card = el(
    "section",
    { class: "card" },
    el("h2", {}, `record #${String(record.index)}`, el("span", { class: "range" }, rangeText(record.record))),
    loaded.gzip === undefined ? "" : el("p", { class: "note" }, `${tr(UI.inflatedNote)}。${membersOf(record).map(memberText).join("・")}`),
    problems.length === 0 ? "" : el("div", { class: "problems" }, el("h3", {}, tr(UI.problems)), el("ul", {}, ...problems)),
    payloadSection(bytes, record, loaded.name),
    relationsSection(bytes, record),
    el("ul", { class: "tree" }, treeItem(bytes, record, tree, rows)),
  );
  const hex = hexPane(bytes, record, tree, cells);
  shown = { record, tree, cells, rows };
  document.querySelector("#card")?.replaceChildren(card);
  document.querySelector("#bytes")?.replaceChildren(hex);
  document.querySelectorAll("#list [data-rec]").forEach((item) => {
    item.classList.toggle("sel", item.getAttribute("data-rec") === String(record.record.start));
  });
};

const pickRecord = (record: RecordMap): void => {
  view = { ...withoutSelection(view), rec: record.record.start };
  writeHash();
  showRecord(record);
};

const workspace = ({ bytes, map, name }: Loaded): HTMLElement => {
  const items = map.records.slice(0, MAX_LISTED).map((record) => {
    const item = el(
      "li",
      { "data-rec": String(record.record.start) },
      el("span", { class: "idx" }, `#${String(record.index)}`),
      el("span", { class: "what" }, recordLabel(bytes, record)),
      el("span", { class: "range" }, rangeText(record.record)),
      record.problems.length === 0 ? "" : el("span", { class: "warn" }, "!"),
      membersOf(record).length === 0 ? "" : el("span", { class: "member" }, membersOf(record).map((m) => `member #${String(m.index)}`).join(" ")),
    );
    item.addEventListener("click", () => { pickRecord(record); });
    return item;
  });
  const list = el(
    "nav",
    { id: "list" },
    el("h2", {}, name, el("span", { class: "range" }, `${String(map.records.length)} ${tr(UI.records)}`)),
    loaded?.gzip === undefined
      ? ""
      : el(
          "p",
          { class: "note" },
          `gzip: ${String(loaded.gzip.members.length)} ${tr(UI.members)}（${String(loaded.gzip.size)} → ${tr(UI.inflatedTo)} ${String(bytes.length)} ${tr(UI.octets)}）`,
        ),
    loaded?.gzip?.error === undefined
      ? ""
      : el("p", { class: "rest" }, `${tr(UI.gzipBroken)}: ${tr(UI.inFile)} ${rangeText(loaded.gzip.error.member)} — ${loaded.gzip.error.message}`),
    el("ul", {}, ...items),
    map.records.length > MAX_LISTED ? el("p", { class: "note" }, `${String(MAX_LISTED)} ${tr(UI.listCut)}`) : "",
    map.rest === undefined
      ? ""
      : el("p", { class: "rest" }, `${tr(UI.rest)}: ${rangeText(map.rest)} — ${map.problems.map((p) => tr(PROBLEMS[p.code])).join(" ")}`),
  );
  return el("main", { class: "workspace" }, list, el("div", { id: "card" }), el("div", { id: "bytes" }));
};

const startPanel = (): HTMLElement => {
  const input = el("input", { type: "file", accept: ".warc,.gz,application/warc,application/gzip" });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file !== undefined) void openFile(file);
  });
  return el(
    "main",
    { class: "start" },
    el("p", {}, el("a", { class: "button", href: formatHash({ src: EXAMPLE, ...(view.lang !== undefined && { lang: view.lang }) }) }, tr(UI.example))),
    el("p", { class: "note" }, tr(UI.exampleNote), " ", el("a", { href: PRIMER, target: "_blank", rel: "noopener" }, "primer")),
    el("p", {}, el("a", { class: "button", href: formatHash({ src: "examples/types.warc", ...(view.lang !== undefined && { lang: view.lang }) }) }, tr(UI.exampleTypes))),
    el("p", { class: "note" }, tr(UI.exampleTypesNote), " ", el("a", { href: formatHash({ src: "examples/types.warc.gz", ...(view.lang !== undefined && { lang: view.lang }) }) }, tr(UI.exampleTypesGz))),
    el("p", {}, el("label", { class: "button" }, tr(UI.openFile), input)),
    el("p", { class: "note" }, tr(UI.dropHint)),
    status === undefined ? "" : el("p", { class: status.error ? "error" : "note" }, status.text),
  );
};

const topBar = (): HTMLElement => {
  const other = lang() === "ja" ? "en" : "ja";
  const switchLang = el("button", { type: "button" }, tr(UI.other));
  switchLang.addEventListener("click", () => {
    view = { ...view, lang: other };
    writeHash();
    render();
  });
  const copy = el("button", { type: "button" }, tr(UI.copy));
  copy.addEventListener("click", () => {
    navigator.clipboard.writeText(location.href).then(
      () => { copy.textContent = tr(UI.copied); },
      () => { copy.textContent = tr(UI.copyFailed); },
    );
  });
  const back = el("button", { type: "button" }, tr(UI.back));
  back.addEventListener("click", () => {
    loaded = undefined;
    shown = undefined;
    status = undefined;
    view = view.lang === undefined ? {} : { lang: view.lang };
    writeHash();
    render();
  });
  return el(
    "header",
    {},
    el("h1", {}, "warc-byte-map"),
    el(
      "p",
      { class: "tagline" },
      tr(UI.tagline),
      " — ",
      el("a", { href: SPEC_PAGE, target: "_blank", rel: "noopener" }, tr(UI.spec)),
      " · ",
      // 別のタブで開く。同じタブで離れると、開いている file が消える。行き先は scripts/check-doc-refs.ts が見る
      el("a", { href: lang() === "ja" ? "docs/ja/" : "docs/", target: "_blank", rel: "noopener" }, tr(UI.docs)),
    ),
    el("div", { class: "tools" }, loaded === undefined ? "" : back, loaded !== undefined && view.src !== undefined ? copy : "", switchLang),
  );
};

const render = (): void => {
  document.documentElement.lang = lang();
  const app = document.querySelector("#app");
  if (app === null) return;
  app.replaceChildren(topBar(), loaded === undefined ? startPanel() : workspace(loaded));
  if (loaded === undefined) return;
  // member= は CDX の offset（圧縮した側）から開くため。その member の中で始まる最初の record を開く
  const member = view.member === undefined ? undefined : loaded.gzip?.members.find((m) => m.compressed.start === view.member);
  const fromMember = member === undefined ? undefined : loaded.map.records.find((r) => r.record.start >= member.inflated.start && r.record.start < member.inflated.end);
  const record = fromMember ?? loaded.map.records.find((r) => r.record.start === view.rec) ?? loaded.map.records[0];
  if (record === undefined) return;
  showRecord(record);
  if (view.part === "payload") {
    selectPayload();
    return;
  }
  const part = view.part === undefined || shown === undefined ? undefined : findPart(shown.tree, view.part);
  if (part !== undefined) select(part, true);
  else if (view.bytes !== undefined) selectBytes(view.bytes);
};

// ── 読み込み ──

const open = (bytes: Uint8Array, name: string): void => {
  if (!isGzip(bytes)) {
    const map = mapWarc(bytes);
    loaded = { bytes, map, name, relations: relationsOf(bytes, map.records) };
    status = undefined;
    render();
    return;
  }
  const inflated = gunzipMembers(bytes, MAX_INFLATED);
  if (inflated.members.length === 0) {
    loaded = undefined;
    const why = inflated.error?.kind === "too-large" ? tr(UI.tooLargeInflated) : `${tr(UI.gzipBroken)}: ${inflated.error?.message ?? ""}`;
    status = { text: why, error: true };
  } else {
    const gzip = { members: inflated.members, size: bytes.length, ...(inflated.error !== undefined && { error: inflated.error }) };
    const map = mapWarc(inflated.bytes);
    loaded = { bytes: inflated.bytes, map, name, relations: relationsOf(inflated.bytes, map.records), gzip };
    status = undefined;
  }
  render();
};

const fail = (error: unknown): void => {
  loaded = undefined;
  status = { text: `${tr(UI.failed)}: ${error instanceof Error ? error.message : String(error)}`, error: true };
  render();
};

const openUrl = async (src: string): Promise<void> => {
  loaded = undefined;
  status = { text: tr(UI.loading), error: false };
  render();
  try {
    const url = new URL(src, location.href);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error(tr(UI.tooLarge));
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error(tr(UI.tooLarge));
    open(bytes, decodeURIComponent(url.pathname.split("/").at(-1) ?? src));
  } catch (error) {
    fail(error);
  }
};

const openFile = async (file: File): Promise<void> => {
  if (file.size > MAX_BYTES) {
    fail(new Error(tr(UI.tooLarge)));
    return;
  }
  // 手元の file は URL で指せないので、hash から src を外す
  const { src: _src, ...rest } = withoutSelection(view);
  view = rest;
  writeHash();
  try {
    open(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (error) {
    fail(error);
  }
};

window.addEventListener("hashchange", () => {
  const next = parseHash(location.hash);
  const reload = next.src !== undefined && next.src !== view.src;
  view = next;
  if (reload) void openUrl(next.src);
  else render();
});
document.addEventListener("dragover", (event) => { event.preventDefault(); });
document.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files[0];
  if (file !== undefined) void openFile(file);
});

render();
if (view.src !== undefined) void openUrl(view.src);
