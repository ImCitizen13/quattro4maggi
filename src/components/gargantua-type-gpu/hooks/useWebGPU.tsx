import { DependencyList, useEffect, useRef } from "react";
import { PixelRatio } from "react-native";
import { type NativeCanvas, useCanvasRef, useDevice } from "react-native-webgpu";

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
) => {
  const { device } = useDevice();
  const canvasRef = useCanvasRef();
  const animationFrameId = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const sizeRef = useRef(size);
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
        // Frame-time sampler. Logs an averaged Δ every ~1s so you can tell
        // whether RAF is firing at 60Hz (~16.6ms) or 120Hz (~8.3ms). On
        // ProMotion devices, requires `CADisableMinimumFrameDuration: true`
        // in Info.plist; otherwise iOS caps the display link at 60Hz.
        // Simulator is always 60Hz regardless.
        let lastFrameMs = 0;
        let frameAccum = 0;
        let frameCount = 0;
        let lastLogMs = 0;

        const render = () => {
          if (cancelled) {
            return;
          }
          const timestamp = Date.now();
          // if (__DEV__) {
          //   if (lastFrameMs) {
          //     const dt = timestamp - lastFrameMs;
          //     frameAccum += dt;
          //     frameCount++;
          //     if (timestamp - lastLogMs >= 1000) {
          //       const avg = frameAccum / frameCount;
          //       console.log(
          //         `[frame rate] avg=${avg.toFixed(2)}ms  fps=${(1000 / avg).toFixed(1)}  n=${frameCount}`,
          //       );
          //       frameAccum = 0;
          //       frameCount = 0;
          //       lastLogMs = timestamp;
          //     }
          //   } else {
          //     lastLogMs = timestamp;
          //   }
          //   lastFrameMs = timestamp;
          // }
          try {
            renderScene(timestamp);
            context.present();
          } catch (error) {
            // Keep RAF alive while still surfacing frame-level failures.
            console.error("[WebGPU render error]", error);
          }
          animationFrameId.current = requestAnimationFrame(render);
        };

        animationFrameId.current = requestAnimationFrame(render);
      }
    })().catch((error) => {
      console.error("[WebGPU init error]", error);
    });

    return () => {
      cancelled = true;
      resizeFnRef.current = null;
      void runCleanup();
    };
  }, [canvasRef, device, ...deps]);

  // Size-watch effect: fires whenever the caller-provided size changes. The
  // resize routine is a no-op until setup completes (resizeFnRef is null) and
  // until pixel dims actually differ from what's already applied — so this
  // effect is safe to fire on the initial render.
  useEffect(() => {
    if (!size || !size.width || !size.height) return;
    resizeFnRef.current?.(size.width, size.height);
  }, [size?.width, size?.height]);

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
