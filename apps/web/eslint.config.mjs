import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const MONEY_RULES = [
  {
    selector: "CallExpression[callee.name='parseFloat'], CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
    message: "Money is never a float. Amounts stay decimal strings; use lib/format.ts.",
  },
  {
    selector: "CallExpression[callee.name='Number']",
    message: "Number() is banned (it silently turns amounts into floats). Use Number.parseInt(x, 10) for integers.",
  },
];

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-syntax": ["error", ...MONEY_RULES],
    },
  },
);
