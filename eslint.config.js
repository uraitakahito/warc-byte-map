// @ts-check
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import importXPlugin from "eslint-plugin-import-x";

export default defineConfig(
  // tsc の project の外にある物（この file と、建てた頁と、Astro の型で動く docs-site）は見ない
  {
    ignores: ["dist-site/**", "node_modules/**", "eslint.config.js", "docs-site/**"],
  },

  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    plugins: {
      "import-x": importXPlugin,
    },
    settings: {
      "import-x/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      // 相対の import は拡張子（.ts）まで書く。Node の type stripping は、書いたとおりの
      // file を読むので、拡張子が無いと scripts/ が実行のときに落ちる
      "import-x/extensions": ["error", "always", { ignorePackages: true, checkTypeImports: true }],
      "import-x/no-anonymous-default-export": ["error", { allowCallExpression: false }],
    },
  },

  {
    rules: {
      // 使わない引数・変数は誤り。わざと使わない物は先頭に _ を付ける
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  {
    files: ["test/**/*.ts"],
    rules: {
      // 試験では、expect で在ることを確かめた後の ! を許す
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
