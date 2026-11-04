import { defineConfig } from "vitest/config";

// 試験の根は repo の根（頁の根の site/ とは違うので、vite.config.ts とは分けた）
const config = defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});

export default config;
