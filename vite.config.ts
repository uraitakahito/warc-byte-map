import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// 頁の根は site/。GitHub Pages の project site は /warc-byte-map/ の下に出るので、base もそこ。
// 手元の口は既定の 5173 を避けて 5291 に固める。塞がっていたら、別の口へ逃げずに落ちる
// （同じ機械でほかのセッションが動かす Vite と、黙って入れ替わらないように）。
const config = defineConfig({
  root: fileURLToPath(new URL("./site", import.meta.url)),
  base: "/warc-byte-map/",
  build: {
    outDir: fileURLToPath(new URL("./dist-site", import.meta.url)),
    emptyOutDir: true,
  },
  server: { port: 5291, strictPort: true },
  preview: { port: 5291, strictPort: true },
});

export default config;
