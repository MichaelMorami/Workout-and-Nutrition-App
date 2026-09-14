// Owner: release-engineer.
//
// Test files are colocated with routes under app/ (see jest.config.js: `app/**/*.test.tsx`).
// expo-router's require.context (expo-router/_ctx.*.js) matches every .ts(x) under app/
// regardless of name — it only special-cases `+api`/`+html` — so without this, Metro follows
// every `app/**/*.test.tsx` straight into `@testing-library/react-native` (a devDependency) and
// whatever else the test pulls in, and bundles it into the shipped app. That is not
// tunnel-specific: it breaks any real bundle — EAS builds, `expo run:ios/android`, production —
// the moment a bundled test transitively touches something Node-only. Confirmed while fixing this
// (#77): `app/foods/[id].test.tsx` imports `test/db`, which resolves the schema via
// `node:fs`/`node:path` and a runtime `require(absPath)` — Metro cannot statically bundle that,
// and even if it could, `@testing-library/react-native`'s logger does `require('console')`, which
// has no Hermes/RN polyfill.
//
// `getDefaultConfig().resolver.blockList` already excludes `__tests__/` dirs, `.expo/` caches and
// native build output (android/app/build, ios/Pods) — see metro-config's own `exclusionList`
// default. Assigning a single RegExp here instead of extending that array would silently drop all
// of those. Concatenating keeps every default and adds ours.
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const defaultBlockList = config.resolver.blockList;
const withDefaults = Array.isArray(defaultBlockList) ? defaultBlockList : [defaultBlockList];

// Matches `*.test.ts`, `*.test.tsx`, `*.test.js`, `*.test.jsx` anywhere in the tree — not just
// under app/. None of those are ever imported by production code (only by Jest), so blocking them
// everywhere is safe and matches the acceptance criteria in #77 (`.test.tsx` and `.test.ts`).
const TEST_FILE_PATTERN = /\.test\.[jt]sx?$/;

config.resolver.blockList = [...withDefaults, TEST_FILE_PATTERN];

module.exports = config;
