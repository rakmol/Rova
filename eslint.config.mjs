import js from '@eslint/js';
import parser from '@typescript-eslint/parser';
export default [
 {ignores:['**/node_modules/**','**/dist/**','**/.next*/**','**/coverage/**','qa/evidence/**']},
 {files:['apps/api/src/**/*.ts','apps/admin/src/**/*.{ts,tsx}','scripts/**/*.mjs'],languageOptions:{parser,ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}},rules:{
  ...js.configs.recommended.rules,
  // TypeScript checks names/types; the base JS versions misinterpret TS declarations.
  'no-undef':'off','no-unused-vars':'off','no-redeclare':'off','no-dupe-class-members':'off',
 }},
];
