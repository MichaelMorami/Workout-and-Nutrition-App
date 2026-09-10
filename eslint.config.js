// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // .worktrees/** holds other agents' in-progress worktrees (see scripts/setup-worktree.sh) —
    // not part of this checkout's source.
    ignores: ["dist/*", ".worktrees/**"],
  }
]);
