/**
 * dummyOrbits
 *
 * Placeholder physics: each particle sits on a circular Kepler orbit
 * (ω = sqrt(mass / r³)), so inner particles orbit faster than outer ones.
 * Init scatters particles uniformly over the canvas, leaving the center empty.
 *
 * state layout (stride 3): r, θ, base scale jitter
 * out layout   (stride 4): x, y, rotation, scale
 */

import type { PhysicsSource } from "../types";

// ============================================================================
// Constants
// ============================================================================

const MIN_R = 0.08; // empty center, fraction of min(width, height)
/** Inner ring (r = MIN_R * ~390px) completes ~1 rev/s at mass 1 */
const MASS_REF_RADIUS = 31;
const MAX_DT = 1 / 30;
const TWO_PI = Math.PI * 2;

// ============================================================================
// Source
// ============================================================================

export const dummyOrbits: PhysicsSource = {
  name: "dummy orbits",
  stateStride: 3,

  init: (state, out, count, bounds) => {
    "worklet";
    const { width, height } = bounds;
    const hx = width / 2;
    const hy = height / 2;
    const minR = MIN_R * Math.min(width, height);
    for (let i = 0; i < count; i++) {
      // Uniform over the canvas, rejecting the empty center
      let dx = 0;
      let dy = 0;
      do {
        dx = (Math.random() - 0.5) * width;
        dy = (Math.random() - 0.5) * height;
      } while (dx * dx + dy * dy < minR * minR);
      const r = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);
      const jitter = 0.8 + Math.random() * 0.4;
      state[i * 3] = r;
      state[i * 3 + 1] = theta < 0 ? theta + TWO_PI : theta;
      state[i * 3 + 2] = jitter;
      out[i * 4] = hx + dx;
      out[i * 4 + 1] = hy + dy;
      out[i * 4 + 2] = theta + Math.PI / 2;
      out[i * 4 + 3] = jitter * (0.1 + 0.1 * Math.min(r / 150, 1));
    }
  },

  step: (state, out, count, params, dt) => {
    "worklet";
    const d = Math.min(dt, MAX_DT) * params.timeScale;
    // ω = sqrt(mass / r³), normalized so MASS_REF_RADIUS gives 2π rad/s at mass 1
    const k = Math.sqrt(params.mass) * TWO_PI * MASS_REF_RADIUS ** 1.5;
    const { cx, cy } = params;
    for (let i = 0; i < count; i++) {
      const r = state[i * 3];
      let theta = state[i * 3 + 1] + (k / (r * Math.sqrt(r))) * d;
      if (theta > TWO_PI) theta -= TWO_PI;
      state[i * 3 + 1] = theta;

      const o = i * 4;
      out[o] = cx + r * Math.cos(theta);
      out[o + 1] = cy + r * Math.sin(theta);
      out[o + 2] = theta + Math.PI / 2;
      // Closer = smaller
      // (sprite is 16px, so 0.1..0.2 => ~1.6..3.2px dots)
      out[o + 3] = state[i * 3 + 2] * (0.1 + 0.1 * Math.min(r / 150, 1));
    }
  },
};
