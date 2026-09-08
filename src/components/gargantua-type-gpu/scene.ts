import type { SharedValue } from "react-native-reanimated";
import tgpu from "typegpu";
import * as d from "typegpu/data";
// `vec2f`/`vec4f` are imported by NAME as well as through the `d` namespace.
// The worklets plugin only forwards named and default import specifiers into a
// worklet — `isImport` in its plugin rejects `ImportNamespaceSpecifier` — so a
// `d.*` call inside a `'worklet'` render would capture the whole `typegpu/data`
// namespace BY VALUE and serialize it, which TypeGPU schemas do not survive.
// Referencing the named binding instead lets `importForwarding` re-import it
// natively on the UI runtime. `d.*` stays fine everywhere outside worklets
// (shader definitions, type positions, setup code).
import { vec2f } from "typegpu/data";
import { UniformsStruct } from "./gpuTypes";
import { starfieldBindGroupLayout } from "./layouts";
import { fragmentFn, vertexFn } from "./shaders";
import { fullScreenTriangle } from "typegpu/common";

interface SceneProps {
  context: GPUCanvasContext;
  device: GPUDevice;
  presentationFormat: GPUTextureFormat;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Per-frame inputs, as SharedValues rather than React refs.
 *
 * `render` may run on the Reanimated UI runtime (see `RenderMode` in
 * `hooks/useWebGPU`), which cannot read a React ref — the ref object belongs to
 * the JS runtime. SharedValues are readable from both, so the same scene code
 * serves `js-raf` and `ui-worklet` without forking.
 */
interface StarfieldConfig {
  /** Read each frame; rotation accumulates only when true. */
  rotationEnabled: SharedValue<boolean>;
  /** Read each frame; forward motion accumulates only when true. */
  forwardEnabled: SharedValue<boolean>;
  /** Read each frame; tilt-driven look-around offset in NDC units. */
  cameraOffset: SharedValue<{ x: number; y: number }>;
  /** Read each frame; true = radial streak look, false = disc stars. */
  hyperspaceEnabled: SharedValue<boolean>;
}

const FORWARD_RATE = 0.6;
// Higher = snappier camera follow; lower = more lag. ~5 gives ~200 ms response.
const TILT_SMOOTH_RATE = 5;
// forwardSpeed uses a 2nd-order spring-damper instead of an exponential lerp,
// so launching into hyperspace overshoots slightly (acceleration kick), and
// dropping back to normal-space coasts past 0 then settles (deceleration with
// a small wobble). Both directions feel kinetic instead of asymptotic.
//
// Critical damping is at D = 2*sqrt(K). D below that = under-damped (overshoot
// + oscillation); D above = over-damped (sluggish). Tuned for 1 light bounce
// then settle in ~700 ms.
const SPEED_SPRING_K = 40; // stiffness — higher = faster + more frequent wobble
const SPEED_SPRING_D = 8; // damping — lower = more overshoot/ringing

export function createStarfieldScene(config: StarfieldConfig) {
  return ({ context, device, presentationFormat, canvasWidth, canvasHeight }: SceneProps) => {
    const root = tgpu.initFromDevice({ device });

    // iResolution must be in render-target pixels to match @builtin(position).
    // Mutable so the hook's `resize` callback can refresh them when the canvas
    // is reconfigured at a new size — without this, the shader keeps using
    // mount-time resolution and visibly stretches after layout shifts (e.g.
    // nav-bar showing/hiding).
    const canvas = context.canvas as unknown as { width: number; height: number };
    let resW = canvas.width || canvasWidth;
    let resH = canvas.height || canvasHeight;

    const uniformsBuffer = root
      .createBuffer(UniformsStruct, {
        iResolution: d.vec2f(resW, resH),
        cameraOffset: d.vec2f(0, 0),
        rotationTime: 0,
        forwardTime: 0,
        hyperspace: 1,
        forwardSpeed: 0,
      })
      .$usage("uniform");

    const bindGroup = root.createBindGroup(starfieldBindGroupLayout, {
      uniforms: uniformsBuffer,
    });

    // NEW pipeline
    const pipeline = root.createRenderPipeline({
      primitive: { topology: 'triangle-list' },
      vertex: fullScreenTriangle,
      fragment: fragmentFn
    })

    // OLD Pipeline
    // const pipeline = root["~unstable"]
    //   .withVertex(vertexFn, {})
    //   .withFragment(fragmentFn, { format: presentationFormat })
    //   .withPrimitive({ topology: "triangle-list" })
    //   .createPipeline();

    let lastMs = 0;
    let rotationTime = 0;
    let forwardTime = 0;
    let forwardSpeed = 0;
    let forwardSpeedVel = 0; // spring velocity for forwardSpeed
    let smoothOffsetX = 0;
    let smoothOffsetY = 0;

    return {
      render: (
        timestamp: number,
        attachment: { view: GPUTextureView; loadOp: "clear" | "load" },
        _backdrop: GPUTextureView | null,
      ) => {
        "worklet";
        // Runs on the Reanimated UI runtime in `ui-worklet` mode. A
        // `'worklet'`-marked function is still an ordinary callable JS
        // function, so `js-raf` invokes it directly and unchanged.
        const dt = lastMs === 0 ? 0 : (timestamp - lastMs) / 1000;
        lastMs = timestamp;
        if (config.rotationEnabled.value) {
          rotationTime += dt;
        }
        if (config.forwardEnabled.value) {
          forwardTime += dt * FORWARD_RATE;
        }

        // Spring-damper toward target. Semi-implicit Euler: update velocity
        // first using current displacement & damping, then update position
        // with the new velocity. More stable at the dt scales we see (~16 ms).
        // This gives a kick on engage and a coast-past-zero on disengage,
        // which is where the springiness comes from.
        const speedTarget = config.forwardEnabled.value ? 1 : 0;
        const speedAccel =
          SPEED_SPRING_K * (speedTarget - forwardSpeed) -
          SPEED_SPRING_D * forwardSpeedVel;
        forwardSpeedVel += speedAccel * dt;
        forwardSpeed += forwardSpeedVel * dt;

        // Exponential low-pass on the raw accelerometer offset.
        // alpha is dt-derived so smoothing feels the same at any framerate.
        const target = config.cameraOffset.value;
        const alpha = 1 - Math.exp(-dt * TILT_SMOOTH_RATE);
        smoothOffsetX += (target.x - smoothOffsetX) * alpha;
        smoothOffsetY += (target.y - smoothOffsetY) * alpha;

        uniformsBuffer.write({
          iResolution: vec2f(resW, resH),
          cameraOffset: vec2f(smoothOffsetX, smoothOffsetY),
          rotationTime,
          forwardTime,
          hyperspace: config.hyperspaceEnabled.value ? 1 : 0,
          forwardSpeed,
        });

        pipeline
          .withColorAttachment({
            view: attachment.view,
            clearValue: [0, 0, 0, 1],
            loadOp: attachment.loadOp,
            storeOp: "store" as const,
          })
          .with(bindGroup)
          .draw(3);
      },
      cleanup: () => {
        root.destroy();
      },
      // Hook calls this after canvas.width/height have already been updated
      // by the resize routine. We just refresh the cached resolution so the
      // next frame's iResolution write uses fresh values. Args are accepted
      // to satisfy the scene contract but unused — canvas.width/height (the
      // hook-applied pixel dims) are the source of truth for `iResolution`.
      resize: (_w: number, _h: number) => {
        resW = canvas.width;
        resH = canvas.height;
      },
    };
  };
}
