// Metro, taught about the monorepo.
//
// The default config assumes an app owns its own node_modules. Here the app
// lives in a pnpm workspace and imports `@labourmarket/client-core` from a
// sibling directory, so Metro has to watch the repository root and resolve
// modules from both the app's and the root's node_modules. Without this the
// shared package resolves in TypeScript and fails at bundle time — the worst
// order to find out in.
//
// `unstable_enableSymlinks` is what makes pnpm's isolated store work: every
// dependency is a symlink into the store rather than a real directory.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
// `disableHierarchicalLookup` is the usual monorepo advice and is WRONG for
// pnpm: with an isolated store every package's own dependencies live in a
// nested `node_modules` beside it, and switching off the walk up the tree
// makes them unresolvable. It stays on.

module.exports = config;
