// Flat ESLint config (eslint 9). Kept close to the existing code style:
// 2-space indent, double quotes, semicolons.
import js from "@eslint/js";

export default [
  {
    ignores: ["node_modules/**", "coverage/**", "data/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        setInterval: "readonly",
        document: "readonly",
        window: "readonly",
        fetchImpl: "off",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
