import { DependencyList, useEffect, useRef, useState } from "react";
import { PixelRatio } from "react-native";
import {
  installWebGPU,
  type NativeCanvas,
  useCanvasRef,
  useDevice,
} from "react-native-webgpu";
import {
  createShareable,
  runOnUISync,
  type Shareable,
  UIRuntimeId,
} from "react-native-worklets";

import type { FrameSampler } from "../../common/frameSampler";

/**
 * Which runtime drives the frame loop.
 *
 * - `js-raf`      — `requestAnimationFrame` on the JS thread. RN backs this with
 *                   `RCTDisplayLink`, which never requests a high frame-rate
 *                   range, so iOS caps it at 60fps even on a 120Hz device.
 * - `ui-worklet`  — the loop runs on the Reanimated UI runtime, where
 *                   `requestAnimationFrame` is the display-link-backed frame
 *                   source that does reach 120Hz. Also frees the JS thread and
 *                   removes a thread hop of input latency.
 *
 * Both modes run the same scene code: a `'worklet'`-marked render function is
 * still an ordinary callable JS function, so `js-raf` calls it directly.
 */
export type RenderMode = "js-raf" | "ui-worklet";

export type UseWebGPUOptions = {
  /** Which runtime drives the frame loop. Default `js-raf`. */
  mode?: RenderMode;
  /**
   * Frame sampler ticked once per presented frame, with the duration of
   * `render + present` as its work value. Hand the same instance to
   * `<FpsOverlay sources={[sampler]} />` to read this loop's real cadence.
   *
   * `js-raf` only — the sampler holds JS closures and a `Set`, so it cannot be
   * ticked from a worklet. In `ui-worklet` mode the overlay's own `ui` row is
   * already measuring this loop (same display link), so a second row would be
   * redundant.
   */
  sampler?: FrameSampler | null;
};

interface SceneProps {
  context: GPUCanvasContext;
  device: GPUDevice;
  gpu: GPU;
  presentationFormat: GPUTextureFormat;
  canvas: NativeCanvas;
  /** Stable canvas layout-point dimensions captured before canvas.width is set. */
  canvasWidth: number;
  canvasHeight: number;
}

type RenderScene = (timestamp: number) => void;
type SceneCleanup = (() => void | Promise<void>) | void;
type SceneResize = (canvasWidth: number, canvasHeight: number) => void;
type SceneResult =
  | RenderScene
  | {
      render: RenderScene;
      cleanup?: SceneCleanup;
      /**
       * Optional. Called by the hook when the canvas dimensions change after
       * setup. The hook has already updated `canvas.width/height` and
       * re-configured the GPU context before invoking this — implementations
       * just need to refresh whatever they cached at setup (e.g. `iResolution`,
       * sprite layout). Layout-point dimensions are passed.
       */
      resize?: SceneResize;
    };
type Scene = (props: SceneProps) => SceneResult | Promise<SceneResult>;

/**
 * Reusable WebGPU lifecycle hook.
 *
 * Scene contract:
 * - Return `render(timestamp)` for frame logic
 * - Optionally return `cleanup()` to release GPU resources (buffers, pipelines, root)
 *
 * The hook manages:
 * - canvas sizing/configure
 * - RAF loop start/stop
 * - cleanup on unmount
 * - async init cancellation safety
 */
export const useWebGPU = (
  scene: Scene | null,
  deps: DependencyList = [],
  /**
   * Optional caller-measured layout-point size for the canvas. When provided,
   * setup waits for the first non-zero size instead of polling `clientWidth`,
   * and any subsequent size change triggers a resize routine
   * (canvas.width/height update, context.configure, scene.resize) without
   * tearing down the scene. Pass `null`/omit to keep the legacy poll-then-
   * freeze behavior used by other screens.
   */
  size?: { width: number; height: number } | null,
  /** Frame-loop options. See {@link UseWebGPUOptions}. */
  options: UseWebGPUOptions = {},
) => {
  const { mode = "js-raf", sampler = null } = options;
  const { device } = useDevice();
  const canvasRef = useCanvasRef();
  const animationFrameId = useRef<number | null>(null);
  /**
   * Shareable holding the UI runtime's RAF handle. Created per setup in
   * `ui-worklet` mode so cleanup can cancel the loop on that runtime — the JS
   * thread's `cancelAnimationFrame` cannot reach it.
   */
  const uiFrameIdRef = useRef<Shareable<number | undefined> | null>(null);
  /**
   * Bumped to force a full scene rebuild. Used by the size-watch effect in
   * `ui-worklet` mode, where in-place resize is unsafe (see that effect).
   */
  const [rebuildToken, setRebuildToken] = useState(0);
  const sceneRef = useRef(scene);
  const sizeRef = useRef(size);
  // Held in a ref so swapping samplers never tears down the scene. `mode` is
  // deliberately NOT a ref — it belongs in the effect deps so switching it
  // tears the scene down and rebuilds it on the other runtime.
  const samplerRef = useRef(sampler);
  samplerRef.current = sampler;
  /**
   * Stores the resize routine produced by setup. Null until setup completes
   * and after teardown. The size-watch effect calls this whenever the caller-
   * provided `size` changes.
   */
  const resizeFnRef = useRef<((w: number, h: number) => void) | null>(null);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    let cancelled = false;
    let sceneCleanup: SceneCleanup;

    const runCleanup = async () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }

      // The UI-runtime loop owns its own RAF handle and can only be cancelled
      // from that runtime. Stop it before tearing down GPU resources, or the
      // next frame draws into destroyed textures.
      const uiFrameId = uiFrameIdRef.current;
      if (uiFrameId !== null) {
        uiFrameIdRef.current = null;
        runOnUISync(() => {
          "worklet";
          if (uiFrameId.value !== undefined) {
            cancelAnimationFrame(uiFrameId.value);
            uiFrameId.value = undefined;
          }
        });
      }

      if (typeof sceneCleanup === "function") {
        await sceneCleanup();
      }
    };

    (async () => {
      const ref = canvasRef.current;
      if (!ref || !device || !sceneRef.current) {
        return;
      }

      const context = ref.getContext("webgpu");
      if (!context) return;

      const canvas = context.canvas as HTMLCanvasElement;

      // Determine initial layout-point dimensions. Two paths:
      //  1. Caller passed a measured `size` (preferred — push-based via onLayout,
      //     correct on every layout shift). Wait one frame for the first
      //     non-zero value.
      //  2. Legacy poll-then-freeze: require two consecutive frames with
      //     identical non-zero clientWidth/Height. Used when no size is passed.
      let stableW: number;
      let stableH: number;
      if (
        sizeRef.current &&
        sizeRef.current.width > 0 &&
        sizeRef.current.height > 0
      ) {
        stableW = sizeRef.current.width;
        stableH = sizeRef.current.height;
      } else {
        let prevW = 0;
        let prevH = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (cancelled) return;
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
          // If the caller starts feeding a size mid-loop, take it.
          if (
            sizeRef.current &&
            sizeRef.current.width > 0 &&
            sizeRef.current.height > 0
          ) {
            prevW = sizeRef.current.width;
            prevH = sizeRef.current.height;
            break;
          }
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          if (w > 0 && h > 0 && w === prevW && h === prevH) break;
          prevW = w;
          prevH = h;
        }
        stableW = prevW;
        stableH = prevH;
      }

      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      canvas.width = stableW * PixelRatio.get();
      canvas.height = stableH * PixelRatio.get();
      context.configure({
        device,
        format: presentationFormat,
        alphaMode: "premultiplied",
      });

      const sceneProps: SceneProps = {
        context,
        device,
        gpu: navigator.gpu,
        presentationFormat,
        canvas: context.canvas as unknown as NativeCanvas,
        canvasWidth: stableW,
        canvasHeight: stableH,
      };

      // Validate setup work in GPU error scopes so failures surface in RN logs.
      const result = await withValidate(
        device,
        sceneRef.current,
        "scene-setup",
      )(sceneProps);
      const normalizedResult =
        typeof result === "function" ? { render: result } : result;

      if (cancelled) {
        if (typeof normalizedResult.cleanup === "function") {
          await normalizedResult.cleanup();
        }
        return;
      }

      const renderScene = normalizedResult.render;
      sceneCleanup = normalizedResult.cleanup;

      // Track applied pixel dims so the size-watch effect skips no-op resizes.
      let appliedPxW = canvas.width;
      let appliedPxH = canvas.height;
      const sceneResize = normalizedResult.resize;
      // Expose a resize routine to the size-watch effect. Updates the
      // swapchain dimensions, re-configures the context, and notifies the
      // scene. Cheap when dims haven't changed (early return).
      resizeFnRef.current = (newW: number, newH: number) => {
        const dpr = PixelRatio.get();
        const pxW = Math.max(1, Math.round(newW * dpr));
        const pxH = Math.max(1, Math.round(newH * dpr));
        if (pxW === appliedPxW && pxH === appliedPxH) return;
        canvas.width = pxW;
        canvas.height = pxH;
        context.configure({
          device,
          format: presentationFormat,
          alphaMode: "premultiplied",
        });
        appliedPxW = pxW;
        appliedPxH = pxH;
        sceneResize?.(newW, newH);
      };

      if (typeof renderScene === "function") {
        if (mode === "ui-worklet") {
          // ------------------------------------------------------------------
          // UI-runtime loop.
          //
          // The closure is serialized ONCE, here. After that the loop lives
          // entirely on the UI runtime: `requestAnimationFrame` there is
          // Reanimated's display-link-backed frame source (120Hz), not RN's
          // `RCTDisplayLink` 1ms timer (60Hz). That difference is the whole
          // point of this mode.
          //
          // Because the transfer happens once, mutable state captured by
          // `renderScene` is copied to the UI runtime and then mutates there,
          // staying self-consistent. Only state written on the JS side and read
          // here needs to be a shared value.
          //
          // Pattern mirrors @typegpu/react's react-native/use-frame.js.
          // ------------------------------------------------------------------
          const frameId = createShareable<number | undefined>(
            UIRuntimeId,
            undefined,
          );
          uiFrameIdRef.current = frameId;

          runOnUISync(() => {
            "worklet";
            // Worklet runtimes start without WebGPU globals. Needed for
            // `navigator.gpu` and the `GPUBufferUsage`/`GPUTextureUsage`
            // constants any scene code may touch per frame.
            installWebGPU();

            const loop = () => {
              frameId.value = requestAnimationFrame(loop);
              try {
                renderScene(Date.now());
                context.present();
              } catch (error) {
                console.error("[WebGPU render error]", error);
              }
            };
            loop();
          });
        } else {
          // ------------------------------------------------------------------
          // JS-thread loop. Capped at 60fps on iOS (see RenderMode), but keeps
          // full JS debuggability and the per-frame sampler.
          //
          // The sampler sees the interval between presented frames (is this
          // loop hitting the budget?) and the cost of render + present (how
          // much of the budget is us). Note `present()` only queues — a
          // GPU-bound stall surfaces late, via swapchain back-pressure, not in
          // `work`.
          // ------------------------------------------------------------------
          const render = () => {
            if (cancelled) {
              return;
            }
            const timestamp = Date.now();
            const workStart = performance.now();
            try {
              renderScene(timestamp);
              context.present();
            } catch (error) {
              // Keep RAF alive while still surfacing frame-level failures.
              console.error("[WebGPU render error]", error);
            }
            samplerRef.current?.tick(performance.now() - workStart);
            animationFrameId.current = requestAnimationFrame(render);
          };

          animationFrameId.current = requestAnimationFrame(render);
        }
      }
    })().catch((error) => {
      console.error("[WebGPU init error]", error);
    });

    return () => {
      cancelled = true;
      resizeFnRef.current = null;
      void runCleanup();
    };
    // `mode` is a dep: switching runtimes must tear the scene down and rebuild
    // it, because the render closure is serialized to the UI runtime at setup.
    // `rebuildToken` is the same mechanism driven by resize in `ui-worklet`.
  }, [canvasRef, device, mode, rebuildToken, ...deps]);

  // Size-watch effect: fires whenever the caller-provided size changes.
  //
  // `js-raf` resizes in place: the resize routine is a no-op until setup
  // completes (resizeFnRef is null) and until pixel dims actually differ from
  // what's already applied, so it is safe to fire on the initial render.
  //
  // `ui-worklet` cannot resize in place. The render closure was serialized to
  // the UI runtime at setup, so anything resize reassigns on the JS side — the
  // composer's ping-pong `texA/texB/viewA/viewB`, the scenes' cached
  // `resW/resH` and `cw/ch` — leaves the UI runtime holding stale views and
  // drawing into destroyed textures. Rebuilding re-serializes the closure with
  // the new resources. Resize is rare here (nav bar settling after first paint,
  // rotation), and `skDataCache` means bubble assets are re-uploaded but not
  // re-fetched.
  useEffect(() => {
    if (!size || !size.width || !size.height) return;
    if (mode === "ui-worklet") {
      if (resizeFnRef.current === null) return; // setup hasn't run yet
      setRebuildToken((n) => n + 1);
      return;
    }
    resizeFnRef.current?.(size.width, size.height);
  }, [size?.width, size?.height, mode]);

  return canvasRef;
};

/*
 * Wrap GPU work in error scopes.
 * Uses try/finally semantics so scopes are always popped (sync or async code).
 */
export function withValidate<T extends unknown[], R>(
  device: GPUDevice,
  fn: (...args: T) => R,
  label = "gpu-call",
) {
  return (...args: T): R => {
    const scopes: GPUErrorFilter[] = [
      "validation",
      "out-of-memory",
      "internal" as GPUErrorFilter,
    ];

    for (const scope of scopes) {
      device.pushErrorScope(scope);
    }

    const popScopes = () => {
      for (const scope of [...scopes].reverse()) {
        device.popErrorScope().then((error) => {
          if (error) {
            console.error(`[${label}] GPU Error [${scope}]:`, error.message);
          }
        });
      }
    };

    let handledAsync = false;
    try {
      const result = fn(...args);

      if (result instanceof Promise) {
        handledAsync = true;
        return result.finally(() => {
          popScopes();
        }) as R;
      }

      return result;
    } finally {
      if (!handledAsync) {
        popScopes();
      }
    }
  };
}
