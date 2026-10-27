import stylistic from "@stylistic/eslint-plugin";
import parser from "@typescript-eslint/parser";

const variables = [
  "const",
  "let",
  "var",
  { selector: "ExportNamedDeclaration[declaration.type='VariableDeclaration']" },
];
const types = [
  "type",
  "interface",
  { selector: "ExportNamedDeclaration[declaration.type='TSTypeAliasDeclaration']" },
  { selector: "ExportNamedDeclaration[declaration.type='TSInterfaceDeclaration']" },
];
const controlFlow = ["if", "for", "while", "do", "switch", "try"];
const padding = [
  { blankLine: "always", prev: "*", next: [...variables, ...types, "function", "class", "export"] },
  { blankLine: "always", prev: [...variables, ...types, "import", "export"], next: "*" },
  { blankLine: "any", prev: variables, next: variables },
  { blankLine: "any", prev: types, next: types },
  { blankLine: "any", prev: "import", next: "import" },
  { blankLine: "always", prev: "*", next: [...controlFlow, "return", "throw"] },
  { blankLine: "always", prev: [...controlFlow, "function", "class", "multiline-block-like"], next: "*" },
];
const assertions = [
  { selector: "ExpressionStatement[expression.callee.object.name='assert']" },
  { selector: "ExpressionStatement[expression.argument.callee.object.name='assert']" },
];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "tmp/**",
      "adrs/**",
      "docs-site/**",
      ".claude/**",
      ".codex/**",
      ".agents/**",
    ],
  },
  {
    files: ["index.ts", "src/**/*.ts"],
    languageOptions: { parser },
    plugins: { "@stylistic": stylistic },
    // Only blank-line placement belongs here. Biome owns every other rule.
    rules: {
      "@stylistic/padding-line-between-statements": ["error", ...padding],
      "@stylistic/lines-between-class-members": [
        "error",
        {
          enforce: [
            { blankLine: "always", prev: "*", next: "method" },
            { blankLine: "always", prev: "method", next: "field" },
          ],
        },
      ],
      "@stylistic/lines-around-comment": [
        "error",
        {
          beforeBlockComment: true,
          beforeLineComment: true,
          allowBlockStart: true,
          allowClassStart: true,
          allowObjectStart: true,
          allowArrayStart: true,
          allowInterfaceStart: true,
          allowTypeStart: true,
          allowEnumStart: true,
          allowModuleStart: true,
        },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "@stylistic/padding-line-between-statements": [
        "error",
        ...padding,
        {
          blankLine: "always",
          prev: "*",
          next: { selector: "VariableDeclaration:has(VariableDeclarator > AwaitExpression)" },
        },
        { blankLine: "always", prev: "*", next: assertions },
        { blankLine: "any", prev: assertions, next: assertions },
      ],
    },
  },
];
