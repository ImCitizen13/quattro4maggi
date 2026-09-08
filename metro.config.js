/**
 * Metro config — required by the Worklets Bundle Mode enabled in babel.config.js.
 *
 * With `bundleMode: true`, the worklets Babel plugin extracts each worklet into
 * its own virtual module under `react-native-worklets/.worklets/<id>.js`. Those
 * files do not exist on disk, so a stock Metro resolver fails the bundle with
 * "Unable to resolve module react-native-worklets/.worklets/<id>.js".
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

module.exports = getBundleModeMetroConfig(getDefaultConfig(__dirname));
