# Black Hole Text

Text pulled into and lensed by a black hole. Skia renders the text;
`react-native-webgpu` + TypeGPU renders the black-hole shader.

**Status:** scaffold only (Task 0).

## Files

- `src/app/black-hole-text/index.tsx` — route screen
- `src/components/black-hole-text/BlackHoleText.tsx` — placeholder component
- `src/app/index.tsx` — home gallery entry ("Black Hole Text", skia + type-gpu tags)
- `babel.config.js` — worklets `importForwarding` entry for this folder

## Notes

- The route uses a plain `View`, not `ThemeView`: `ThemeView` centers its
  children, which collapses a flex-only WebGPU canvas to 0x0.
- `src/components/black-hole-text` is listed in `importForwarding.relativePaths`
  in `babel.config.js` so TypeGPU shaders work in `ui-worklet` mode. After
  babel config changes, run `bunx expo start --clear`.

## Tasks

- Task 0 — scaffold ✅
