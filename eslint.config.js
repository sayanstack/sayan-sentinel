// @ts-check
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.generated.*",
      "examples/vulnerable-demo-app/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // Disabled: NestJS constructor-injected classes must stay value
      // imports for emitDecoratorMetadata to produce usable DI metadata —
      // this rule's autofix would silently break dependency injection.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  eslintConfigPrettier,
);
