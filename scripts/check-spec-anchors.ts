/**
 * 用語の表（src/viewer/terms.ts）の行き先が、fork の公開の頁に在るかを確かめる。
 *
 * - id: 頁の見出しに、その id が在るか
 * - 番号: 頁が CSS の counter で振る表示の番号（h1 → 3、h2 → 3.1、h3 → 3.1.1）を数え直し、
 *   表に書いた番号と同じか（HTML に番号の文字は無いので、見出しを前から数える）
 *
 * 外の頁を読むので CI では走らせない。fork の頁を変えた後と、表を直した後に手元で回す。
 *   pnpm run check:spec-anchors
 */
import { FIELD_SECTIONS, HTTP_SECTIONS, PAYLOAD_SECTION, SPEC_PAGE, TERMS, type Section } from "../src/viewer/terms.ts";

const BODY_START = '<h1 class="nocount">';
const BODY_END = "</div><!-- /.container -->";

const html = await (await fetch(SPEC_PAGE)).text();
const body = html.slice(html.indexOf(BODY_START) + BODY_START.length, html.indexOf(BODY_END));

/** 見出しの id → 表示の番号（fork の styles.css の counter と同じ数え方）。 */
const numbers = new Map<string, string>();
const counters = [0, 0, 0, 0, 0];
for (const m of body.matchAll(/<h([1-5])([^>]*)>/g)) {
  const level = Number(m[1]);
  const attrs = m[2] ?? "";
  if (attrs.includes("nocount")) continue;
  counters[level - 1] = (counters[level - 1] ?? 0) + 1;
  counters.fill(0, level);
  const id = /\sid="([^"]+)"/.exec(attrs)?.[1];
  if (id !== undefined) numbers.set(id, counters.slice(0, level).join("."));
}

const sections: Section[] = [
  ...Object.values(TERMS).flatMap((t) => (t.section === undefined ? [] : [t.section])),
  ...Object.values(FIELD_SECTIONS),
  ...Object.values(HTTP_SECTIONS),
  PAYLOAD_SECTION,
];
const problems = [...new Map(sections.map((s) => [`${s.anchor} ${s.number}`, s])).values()].flatMap((s) => {
  const shown = numbers.get(s.anchor);
  if (shown === undefined) return [`#${s.anchor} が頁に無い`];
  return shown === s.number ? [] : [`#${s.anchor} の番号は頁では ${shown}、表では ${s.number}`];
});

console.log(`${SPEC_PAGE}: 見出し ${String(numbers.size)} 個・表の行き先 ${String(new Set(sections.map((s) => s.anchor)).size)} 個`);
for (const p of problems) console.error(`✗ ${p}`);
process.exitCode = problems.length === 0 ? 0 : 1;
