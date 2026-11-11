import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// 頁の根は site/。GitHub Pages の project site は /warc-byte-map/ の下に出るので、base もそこ。
// 手元のポートは既定の 5173 を避けて 5291 に固める。塞がっていたら、別のポートへ逃げずに落ちる
// （同じ機械でほかのセッションが動かす Vite と、黙って入れ替わらないように）。
const config = defineConfig({
  root: fileURLToPath(new URL("./site", import.meta.url)),
  base: "/warc-byte-map/",
  // 無い URL は Pages と同じく 404 にする。既定の spa だと、手元の preview で viewer に化ける
  // （viewer は hash だけで動くので、index.html への fallback は要らない）。
  appType: "mpa",
  build: {
    outDir: fileURLToPath(new URL("./dist-site", import.meta.url)),
    emptyOutDir: true,
  },
  server: { port: 5291, strictPort: true },
  preview: { port: 5291, strictPort: true },
});

export default config;
