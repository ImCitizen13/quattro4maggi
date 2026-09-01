import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import React, { useMemo, useRef, useState } from "react";
import { Canvas } from "react-native-webgpu";


import { createStarfieldScene } from "../../components/gargantua-type-gpu/scene";
import { createBubbleScene } from "../../components/gargantua-type-gpu/movingBubbleScene";
import { createCenterBubbleScene } from "../../components/gargantua-type-gpu/centerBubbleScene";
import { composeLayered } from "../../components/gargantua-type-gpu/composeLayered";
import { useLoadImages } from "../../components/gargantua-type-gpu/hooks/useLoadImages";
import { perf } from "../../components/gargantua-type-gpu/perf/perfMarks";
import { useFrameCallback } from "react-native-reanimated";
import { useWebGPU } from "@/components/gargantua-type-gpu/hooks/useWebGPU";

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
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [forwardEnabled, setForwardEnabled] = useState(false);

  const rotationEnabledRef = useRef(rotationEnabled);
  rotationEnabledRef.current = rotationEnabled;
  const forwardEnabledRef = useRef(forwardEnabled);
  forwardEnabledRef.current = forwardEnabled;
  const hyperspaceEnabledRef = useRef(true);
  hyperspaceEnabledRef.current = true;

  const cameraOffsetRef = useRef({ x: 0, y: 0 });

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

  useFrameCallback(() => {}).setActive(true);

  const scene = useMemo(() => {
    const starfield = createStarfieldScene({
      rotationEnabledRef,
      forwardEnabledRef,
      cameraOffsetRef,
      hyperspaceEnabledRef,
    });
    const centerBubble = createCenterBubbleScene({ radiusPx: 200, invertDistortion: false, shapeN: 2.0 });

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

    const bubbles = createBubbleScene({ datas, forwardEnabledRef });
    const composed = composeLayered([
      { scene: starfield },
      { scene: bubbles },
      { scene: centerBubble, readsBackdrop: true },
    ]);

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
  }, [datas]);
  const canvasRef = useWebGPU(scene, [scene], canvasSize);

  return (
    // <GestureDetector gesture={tap}>

    <Pressable
      style={styles.container}
      onPress={() => {
        perf.start("input-to-render-tap");
        setForwardEnabled((v) => !v);
      }}
    >
      <View style={StyleSheet.absoluteFill} onLayout={onCanvasLayout}>
        <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
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
