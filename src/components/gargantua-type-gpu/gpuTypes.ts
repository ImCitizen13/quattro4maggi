import * as d from "typegpu/data";

export const UniformsStruct = d.struct({
  iResolution: d.vec2f,
  cameraOffset: d.vec2f,
  rotationTime: d.f32,
  forwardTime: d.f32,
  // 1 = hyperspace (radial streaks), 0 = disc stars (angular Gaussian gate).
  hyperspace: d.f32,
  // CPU-smoothed [0..1]: 0 = paused (tight peaks → dot stars),
  // 1 = full speed (loose peaks → streaks). Drives the depth tightness
  // coefficient inside the hyperspace contribution.
  forwardSpeed: d.f32,
});
