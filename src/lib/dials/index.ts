/** Dev tuning controls. Guide: docs/dev-tuning-controls.md */
export type { DialConfig, TransitionConfig } from "dialkit";
export { resolveDialDefaults } from "./dialDefaults";
export { setDialValues } from "./dialStore";
export { toSpringConfig, toTimingConfig, withDialCurve } from "./transitions";
export {
  useDials,
  useDialsListener,
  useDialsShared,
  type DialOptions,
  type DialValues,
} from "./useDials";
