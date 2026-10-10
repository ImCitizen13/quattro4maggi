// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'temp/*'],
  },
  {
    // eslint-config-expo 57 enables the React Compiler lint rules as errors.
    // Reanimated shared values (`.value` writes) and Skia/WebGPU refs are
    // flagged by design, so keep them visible as warnings only.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
