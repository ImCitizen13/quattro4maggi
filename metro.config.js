/**
 * Metro config — required by the Worklets Bundle Mode enabled in babel.config.js.
 *
 * With `bundleMode: true`, the worklets Babel plugin extracts each worklet into
 * its own module under `react-native-worklets/.worklets/<id>.js`, which it writes
 * to disk during transform. A stock Metro resolver does not know that path, so the
 * bundle fails with "Unable to resolve module react-native-worklets/.worklets/<id>.js".
 *
 * Resolution is only half of it: because those files are written *during* transform,
 * after Metro has already crawled the filesystem, a first build on a clean checkout
 * still fails with "Failed to get the SHA-1 for: … .worklets/<id>.js". See
 * `.claude/rules/webgpu-shaders.md` and the `prewarm-worklets` npm script.
 *
 * `getBundleModeMetroConfig` wraps `resolver.resolveRequest` to serve those
 * virtual modules and installs a `createModuleIdFactory` that assigns each
 * worklet a stable, content-derived module id — the UI runtime looks worklets up
 * by that id, so it has to match across runtimes.
 *
 * Use `getBundleModeMetroConfig` (the Expo entry point), not the
 * `bundleModeMetroConfig` object, which is for bare React Native projects.
 */
const { getDefaultConfig } = require("expo/metro-config");
const { getBundleModeMetroConfig } = require("react-native-worklets/bundleMode");

const { withRozenite } = require("@rozenite/metro");

// Rozenite (React Native DevTools plugins, e.g. the Dials panel) is off unless
// WITH_ROZENITE=true (`bun run start:dials`) AND APP_ENV=development (set in
// .env.local locally; EAS preview/production profiles use other values), so
// plain starts and non-development EAS builds get the config untouched.
// See docs/dev-tuning-controls.md.
module.exports = withRozenite(getBundleModeMetroConfig(getDefaultConfig(__dirname)), {
  enabled: process.env.WITH_ROZENITE === "true" && process.env.APP_ENV === "development",
  include: ["rozenite-plugin-dialkit"],
});
