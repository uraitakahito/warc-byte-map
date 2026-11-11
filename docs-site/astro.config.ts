import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  // Pages の 1 つのサイトに、viewer（根）と docs（/docs/）が同居する。viewer の URL は動かさない
  // （fork の注釈つきの WARC 1.1 が、そこへ link を張っている）。
  // README の 2 本の URL は、この 2 つから組んだ物（scripts/check-doc-refs.ts が突き合わせる）。
  site: "https://uraitakahito.github.io",
  base: "/warc-byte-map/docs",
  // viewer の出力（vite.config.ts の outDir）の下に建てる。vite build は出力先を空にするので、
  // 順番は package.json の site:build のとおり viewer が先。
  outDir: "../dist-site/docs",
  // 本文の link は相対で書く。Web Capture の他の repo の hast-rebase-links は写さない（base が 2 段だと、
  // 本文の /warc-byte-map/… を /warc-byte-map/docs/warc-byte-map/… に書き換える）。行き先は
  // check-doc-refs.ts が建てた HTML で確かめる。相対は URL の末尾の / で行き先が変わるので、揃える。
  trailingSlash: "always",
  // 手元のポートは 5292 に固める。塞がっていたら、別のポートへ逃げずに落ちる（vite.config.ts と同じ理由）。
  server: { port: 5292 },
  vite: { server: { strictPort: true } },
  integrations: [
    starlight({
      title: "warc-byte-map Docs",
      // 英語が根（接頭辞無し）、日本語は /ja/ の下。Web Capture の他の repo と同じ形。
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        ja: { label: "日本語", lang: "ja" },
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/uraitakahito/warc-byte-map",
        },
      ],
      // Starlight はページを訳すがナビは訳さない。translations が無いと、
      // 英語の目次に日本語のページがぶら下がる。
      sidebar: [
        { label: "Overview", translations: { ja: "概要" }, slug: "index" },
        { label: "Reading the viewer", translations: { ja: "viewer の読み方" }, slug: "viewer" },
        { label: "Link format", translations: { ja: "リンクの形" }, slug: "links" },
        { label: "Development", translations: { ja: "開発" }, slug: "development" },
        // sidebar の項目は「次へ」の対象になるので、最後のページの frontmatter に next: false がある。
        {
          label: "Open the viewer",
          translations: { ja: "viewer を開く" },
          link: "https://uraitakahito.github.io/warc-byte-map/",
        },
      ],
    }),
  ],
});
