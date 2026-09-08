/**
 * Worklets plugin options enable TypeGPU's UI-thread render loops.
 *
 * `@typegpu/react` detects `react-native-worklets` at runtime and, when found,
 * runs `useFrame` callbacks on the UI thread instead of the JS thread. That
 * matters here because RN's `requestAnimationFrame` hangs off `RCTDisplayLink`,
 * which never requests a high frame-rate range — so a RAF render loop is capped
 * at 60fps even on a 120Hz device, while Reanimated's own display link runs at
 * 120. Measured on-device: `ui` row 120fps, `gpu` row 60fps.
 *
 * `importForwarding` lists the directories holding module-scope shader
 * definitions. TypeGPU resources (roots, pipelines, buffers, textures, bind
 * groups) transfer between runtimes automatically, but shader definitions
 * (`tgpu.fn`, `'use gpu'` functions, `tgpu.comptime`) cannot be serialized —
 * worklets re-import them natively from these paths instead.
 *
 * Metro caches transforms, so run `bunx expo start --clear` after changing this.
 */
const workletsPluginOptions = {
  bundleMode: true,
  importForwarding: {
    moduleNames: ["typegpu"],
    relativePaths: ["src/components/gargantua-type-gpu"],
  },
};

module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "unplugin-typegpu/babel",
      ["react-native-worklets/plugin", workletsPluginOptions],
    ],
  };
};
