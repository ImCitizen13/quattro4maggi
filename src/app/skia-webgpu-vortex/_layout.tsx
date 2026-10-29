import { ThemeHeaderTitle } from "@/components/Theme";
import { Stack } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";

// ============================================================================
// Layout
// ============================================================================

/**
 * Three native tabs under the shared "Skia + WebGPU Vortex" stack header:
 * Skottie and WebGPU texture sources (placeholders) and the Snapshot path.
 */
export default function SkiaWebgpuVortexLayout() {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Skia + WebGPU Vortex" />,
        }}
      />
      <NativeTabs tintColor="#fff" backgroundColor="#1a1a1a">
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Skottie</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="play.rectangle.fill" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="webgpu">
          <NativeTabs.Trigger.Label>WebGPU</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="cpu" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="snapshot">
          <NativeTabs.Trigger.Label>Snapshot</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="camera.viewfinder" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
