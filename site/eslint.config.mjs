import js from '@eslint/js'
import babelParser from '@babel/eslint-parser'
import reactHooks from 'eslint-plugin-react-hooks'
import nextPlugin from '@next/eslint-plugin-next'

// site/package.json pins `typescript: ^7.0.2` (the new native compiler), which
// typescript-eslint's peer range (>=4.8.4 <6.1.0) does not cover -- and it isn't
// just an unmet-peer technicality: @typescript-eslint/parser throws
// "typescript-eslint does not support TS 7.0" at parse time, so it cannot run
// here at all, type-aware or not (see docs/BACKLOG.md and
// https://github.com/typescript-eslint/typescript-eslint/issues/10940).
// Two TypeScript majors also can't cleanly coexist in one npm tree when the
// root project directly depends on "typescript" itself -- confirmed by testing
// npm overrides (including the documented `$name` peer-reference trick): npm
// either hard-fails with ERESOLVE, or "succeeds" by silently reusing the root's
// TS 7 for the peer instead of actually installing a nested TS 5/6, which is
// worse than no linting at all.
//
// So: parse with @babel/eslint-parser + @babel/preset-typescript instead.
// Babel only strips TS syntax to produce an ESTree AST -- it never imports the
// "typescript" package, so there is no version conflict and no type-aware
// linting (tsc --noEmit already covers type correctness in CI).
export default [
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'e2e-scratch/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ['@babel/preset-react', '@babel/preset-typescript']
        }
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly'
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // Not type-aware here (see header comment), and TS's own compiler
      // already reports undefined identifiers -- tsc --noEmit is the source
      // of truth for that, not a non-type-aware parse.
      'no-undef': 'off',
      // TS-only constructs (type-only imports, interface members, generic
      // params) read as "unused" to the plain JS rule; tsc's `strict` mode
      // (site/tsconfig.json) is the real check for genuinely dead code.
      'no-unused-vars': 'off',
      // eslint-plugin-react-hooks v7's "recommended" also bundles the React
      // Compiler readiness rules. This app does not use React Compiler (no
      // babel-plugin-react-compiler), so these are pure advisory noise here,
      // and both fired as false positives against intentional, correct code:
      //  - set-state-in-effect flagged the "reset state, then start an async
      //    fetch" effect body in HeadToHead.tsx/MetroPanel.tsx, and the
      //    "read a browser-only API (matchMedia) once on mount, then
      //    subscribe" effect in app/page.tsx. Both are the standard,
      //    React-docs-blessed patterns for this case, and for a static
      //    export (next.config.ts: output: 'export') the matchMedia read
      //    specifically *cannot* move to a useState lazy initializer --
      //    that runs during the build-time prerender, where `window`
      //    does not exist, and would break the build.
      //  - preserve-manual-memoization flagged `adjusted` (HeadToHead.tsx)
      //    as "may be mutated later" -- it's a destructured boolean prop
      //    that is never reassigned anywhere in the component (verified);
      //    this is the compiler analysis's conservative bailout, not a
      //    real mutation.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off'
    }
  }
]
