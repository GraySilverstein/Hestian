import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "out/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "always"],
      "no-console": "error",
      "prefer-const": "error",
    },
  },
  {
    // The structured logger is the single permitted console boundary.
    files: ["src/core/logging/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["tests/**/*.ts", "scripts/**/*.ts", "scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },
);
