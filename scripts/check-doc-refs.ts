/**
 * docs と repo の中身がずれていないかを見る。`pnpm run site:check`（build ＋ これ）で走る。
 *
 * `astro build` は、片方の言語にしか無いページも、切れたリンクも、そのまま建てる。見るのは:
 *
 *   1. en と ja の対: docs/*.md と docs/ja/*.md が同じ file 名で揃っている（見出しの構造は見ない。
 *      同じ見出しを強制すると日本語が悪くなる）
 *   2. 本文が code span で名指しする repo の path が実在する
 *   3. README の 2 本の URL が、docs-site/astro.config.ts の site ＋ base から組んだ物と一致する
 *   4. viewer（src/viewer/main.ts）から docs へのリンクが、base と合っている
 *   5. 建てた docs の全部のリンク（本文・sidebar・言語の切り替え）の先が dist-site に在る。見出しへの
 *      リンクなら、その見出しも在る。viewer への絶対 URL も dist-site に写して見るので、viewer か docs が
 *      artifact から消えれば赤になる（Pages に出すのは dist-site 1 つで、2 つの build が同居している）
 *
 * 効いているのを見るには: ja のページを 1 枚 `.ja.md` に改名する → 赤。本文に `src/nope.ts` → 赤。
 * 本文に [x](/nope/) → 赤。README の URL を綴り違える → 赤。main.ts の "docs/ja/" を変える → 赤。
 * site:build の順を逆にする → 赤。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = resolve(ROOT, "docs-site/src/content/docs");
const DIST = resolve(ROOT, "dist-site");
/** 本文の code span のうち、repo の path として確かめる物。 */
const NAMED_PATH = /`((?:src|site|scripts|test|docs-site|dist-site|\.github)\/[A-Za-z0-9_./-]+|package\.json|README\.md|vite\.config\.ts)`/g;
/** 建てた HTML のリンク。option は言語の切り替えの物だけ（テーマの選択の value は path ではない）。 */
const BUILT_LINK = /<a\s[^>]*?href="([^"]*)"|<option\s[^>]*?value="(\/[^"]*)"/g;

const problems: string[] = [];
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");

// ─── 1. en と ja の対 ─────────────────────────────────────────────
const pages = (dir: string): string[] => readdirSync(dir).filter((name) => /\.mdx?$/.test(name));
const en = pages(DOCS);
const ja = pages(join(DOCS, "ja"));
for (const name of en) if (!ja.includes(name)) problems.push(`docs/ja/${name} が無い（en には在る）`);
for (const name of ja) if (!en.includes(name)) problems.push(`docs/${name} が無い（ja には在る）`);

// ─── 2. 本文が名指しする path の実在 ─────────────────────────────
for (const [locale, names] of [["", en], ["ja/", ja]] as const) {
  for (const name of names) {
    for (const [, path = ""] of readFileSync(join(DOCS, locale, name), "utf8").matchAll(NAMED_PATH)) {
      if (!existsSync(resolve(ROOT, path))) problems.push(`docs/${locale}${name}: \`${path}\` が無い（移した？消した？）`);
    }
  }
}

// ─── 3. README の URL ⇔ astro.config.ts の site ＋ base ──────────
const configValue = (key: string): string => {
  const value = new RegExp(`^\\s*${key}:\\s*"([^"]+)"`, "m").exec(read("docs-site/astro.config.ts"))?.[1];
  if (value === undefined) throw new Error(`docs-site/astro.config.ts: ${key} が読めない（書き方を変えたなら、ここも直す）`);
  return value;
};
const site = configValue("site");
const base = configValue("base");
const readme = read("README.md");
for (const url of [`${site}${base}/`, `${site}${base}/ja/`]) {
  if (!readme.includes(`<${url}>`)) problems.push(`README.md: <${url}> へのリンクが無い（astro.config.ts の site と base から組んだ URL）`);
}

// ─── 4. viewer から docs へのリンク ⇔ base ────────────────────────
// viewer は base の 1 つ上（/warc-byte-map/）に居て、docs を相対で指す
const viewerBase = base.slice(0, base.lastIndexOf("/") + 1);
const docsDir = base.slice(viewerBase.length);
const viewer = read("src/viewer/main.ts");
for (const href of [`"${docsDir}/"`, `"${docsDir}/ja/"`]) {
  if (!viewer.includes(href)) problems.push(`src/viewer/main.ts: docs へのリンク ${href} が無い（astro.config.ts の base と合わせる）`);
}

// ─── 5. 建てた docs のリンク ──────────────────────────────────────
const builtDocs = join(DIST, docsDir);
// 404.html は無いページ /404/ を言語の切り替えが指す（Pages も、根の外の 404.html は使わない）
const built = existsSync(builtDocs) ? readdirSync(builtDocs, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".html") && f !== "404.html") : [];
if (built.length === 0) problems.push(`dist-site/${docsDir}/ に HTML が無い（build していない？ viewer の build が後に走った？）`);

let links = 0;
for (const file of built) {
  const where = `dist-site/${docsDir}/${file}`;
  const page = new URL(`${site}${base}/${file.replace(/index\.html$/, "")}`);
  for (const match of readFileSync(join(builtDocs, file), "utf8").matchAll(BUILT_LINK)) {
    const href = match[1] ?? match[2] ?? "";
    const url = new URL(href, page);
    links += 1;
    if (url.origin !== site || !url.pathname.startsWith(viewerBase)) {
      // 外のサイトへの絶対 URL は見ない。相対で書いたのに外へ出た物（[x](/page/) と書いた）は誤り
      if (!/^[a-z]+:/i.test(href)) problems.push(`${where}: ${href} は ${viewerBase} の外を指す（本文のリンクは相対で書く）`);
      continue;
    }
    const path = decodeURIComponent(url.pathname.slice(viewerBase.length));
    const target = join(DIST, path, url.pathname.endsWith("/") ? "index.html" : "");
    if (!existsSync(target)) {
      problems.push(`${where}: ${href} の先が無い`);
      continue;
    }
    // docs の中の #… は見出し。viewer の #… は見出しではない（hash に状態を書く）ので見ない
    if (url.hash !== "" && path.startsWith(`${docsDir}/`) && !readFileSync(target, "utf8").includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)) {
      problems.push(`${where}: ${href} の見出しが無い`);
    }
  }
}

if (problems.length === 0) console.log(`docs: ページ ${String(en.length)} 組・建てた HTML ${String(built.length)} 枚・リンク ${String(links)} 本を確かめた`);
for (const problem of problems) console.error(`✗ ${problem}`);
process.exitCode = problems.length === 0 ? 0 : 1;
