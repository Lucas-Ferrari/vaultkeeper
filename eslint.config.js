// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Package dependency rule (design 01), enforced at import level:
 *   web        -> api-client, shared
 *   api-client -> shared (+ type-only @vaultkeeper/api)
 *   api        -> shared
 *   shared     -> nothing internal
 * Relative escapes into another app/package are blocked too.
 */
const pkg = (name) => ({
  group: [`@vaultkeeper/${name}`, `@vaultkeeper/${name}/*`],
  message: `This package must not depend on @vaultkeeper/${name} (see design 01 dependency rule).`,
});
const relative = (dir) => ({
  group: [`**/${dir}/**`, `**/${dir}`],
  message: `Do not reach into ${dir} via relative paths; depend on its public package instead.`,
});

const restrict = (patterns) => ({
  "no-restricted-imports": "off",
  "@typescript-eslint/no-restricted-imports": ["error", { patterns }],
});

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.data/**",
      "**/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: restrict([pkg("api"), relative("apps/api"), relative("api/src")]),
  },
  {
    files: ["packages/api-client/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            pkg("web"),
            relative("apps/web"),
            relative("apps/api"),
            {
              group: ["@vaultkeeper/api", "@vaultkeeper/api/*"],
              allowTypeImports: true,
              message: "api-client may only `import type` from @vaultkeeper/api (ADR1).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/**/*.ts"],
    rules: restrict([
      pkg("web"),
      pkg("api-client"),
      relative("apps/web"),
      relative("packages/api-client"),
    ]),
  },
  {
    files: ["packages/shared/**/*.ts"],
    rules: restrict([
      { group: ["@vaultkeeper/*"], message: "shared must not depend on other internal packages." },
      relative("apps"),
      relative("packages/api-client"),
    ]),
  },
  prettier,
);
