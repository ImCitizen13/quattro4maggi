import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import React, { useMemo, useState } from "react";
import { useSharedValue } from "react-native-reanimated";
import { Canvas } from "react-native-webgpu";

import { createStarfieldScene } from "../../components/gargantua-type-gpu/scene";
import { createBubbleScene } from "../../components/gargantua-type-gpu/movingBubbleScene";
import { createCenterBubbleScene } from "../../components/gargantua-type-gpu/centerBubbleScene";
import { composeLayered } from "../../components/gargantua-type-gpu/composeLayered";
import { useLoadImages } from "../../components/gargantua-type-gpu/hooks/useLoadImages";
import { perf } from "../../components/gargantua-type-gpu/perf/perfMarks";
import {
  type RenderMode,
  useWebGPU,
} from "@/components/gargantua-type-gpu/hooks/useWebGPU";
import { FpsOverlay } from "../../components/common/FpsOverlay";
import { useFrameSampler } from "../../components/common/frameSampler";

// // DeviceMotion.rotation is in radians (gravity-corrected attitude).
// // Comfortable tilt is ~±30° (±0.52 rad). Scale maps that range to ~±0.4 NDC.
// const TILT_SCALE = 0.7;
// // Tilts smaller than ~3° register as zero to kill jitter at rest.
// const TILT_DEADZONE = 0.05;

// // Soft deadzone: zero inside the threshold, then ramps from 0 (preserves sign,
// // avoids the snap a hard `if (abs < t) return 0; else return v` would cause).
// function deadzone(v: number, threshold: number) {
//   const abs = Math.abs(v);
//   if (abs < threshold) return 0;
//   return Math.sign(v) * (abs - threshold);
// }

export default function MayTheFourthScreen() {
  /**
   * Which runtime drives the frame loop. Switching tears the scene down and
   * rebuilds it on the other runtime, so the two modes can be compared back to
   * back on the same build and device.
   */
  const [renderMode, setRenderMode] = useState<RenderMode>("js-raf");

  // Per-frame scene inputs. SharedValues rather than refs because `render` runs
  // on the UI runtime in `ui-worklet` mode, where a React ref is unreadable.
  // Readable from the JS thread too, so `js-raf` behaves identically.
  const rotationEnabled = useSharedValue(false);
  const forwardEnabled = useSharedValue(false);
  const hyperspaceEnabled = useSharedValue(true);
  const cameraOffset = useSharedValue({ x: 0, y: 0 });

  // Measured layout-point size of the canvas wrapper. Pushed in by `onLayout`
  // and forwarded to `useWebGPU` so the swapchain + scenes resize correctly
  // when the layout shifts (e.g. the nav bar appearing after first paint).
  const [canvasSize, setCanvasSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvasSize((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  };

  const { datas } = useLoadImages();

  const scene = useMemo(() => {
    const starfield = createStarfieldScene({
      rotationEnabled,
      forwardEnabled,
      cameraOffset,
      hyperspaceEnabled,
    });
    const centerBubble = createCenterBubbleScene({
      radiusPx: 200,
      invertDistortion: false,
      shapeN: 2.0,
    });

    // Layered scene stack: starfield (base), sprite bubbles, center glass
    // bubble (samples backdrop for true lens distortion). The composer owns
    // ping-pong textures + final blit; layers see opaque (view, loadOp,
    // backdrop) per frame instead of grabbing the swapchain themselves.
    if (!datas || datas.length === 0) {
      return composeLayered([
        { scene: starfield },
        { scene: centerBubble, readsBackdrop: true },
      ]);
    }

    const bubbles = createBubbleScene({ datas, forwardEnabled });
    const composed = composeLayered([
      { scene: starfield },
      { scene: bubbles },
      { scene: centerBubble, readsBackdrop: true },
    ]);

    // `js-raf` only: `perf` is a module-level singleton living on the JS
    // runtime, so the UI runtime would either see its own empty copy or fail
    // outright. Skip the wrapper entirely in `ui-worklet` mode rather than
    // reporting numbers that mean nothing.
    if (renderMode === "ui-worklet") {
      return composed;
    }

    // Wrap once to fire perf marks (composer doesn't know about them).
    return async (props: Parameters<typeof composed>[0]) => {
      const inner = await composed(props);
      return {
        ...inner,
        render: (t: number) => {
          perf.end("input-to-render-tap");
          perf.end("input-to-render-tilt");
          inner.render(t);
        },
      };
    };
  }, [datas, renderMode]);
  // Ticked once per presented frame by the RAF loop inside `useWebGPU`, and
  // rendered as the `gpu` row of the overlay. The overlay's own `ui` row reads
  // the UI-thread display link — a different clock that cannot see the JS-thread
  // loop stall, so a gap between the two rows means the JS thread is the
  // problem. In `ui-worklet` mode both rows would measure the same display
  // link, so the `gpu` row is dropped as redundant.
  const gpuSampler = useFrameSampler("gpu");
  const canvasRef = useWebGPU(scene, [scene], canvasSize, {
    mode: renderMode,
    sampler: gpuSampler,
  });

  return (
    // <GestureDetector gesture={tap}>

    <Pressable
      style={styles.container}
      onPress={() => {
        perf.start("input-to-render-tap");
        // Written straight to the SharedValue — the scene reads it every frame
        // on whichever runtime is driving, with no React re-render involved.
        forwardEnabled.value = !forwardEnabled.value;
      }}
    >
      <View style={StyleSheet.absoluteFill} onLayout={onCanvasLayout}>
        <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
        <FpsOverlay
          dark
          sources={renderMode === "js-raf" ? [gpuSampler] : []}
        />
        <View style={styles.controls} pointerEvents="box-none">
          <Pressable
            style={styles.button}
            onPress={() =>
              setRenderMode((m) => (m === "js-raf" ? "ui-worklet" : "js-raf"))
            }
          >
            <Text style={styles.buttonText}>
              {renderMode === "js-raf" ? "JS thread (RAF)" : "UI thread"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  controls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 10,
  },
  button: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.3)",
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
