import { ThemeHeaderTitle } from "@/components/Theme";
import { Stack } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";

// ============================================================================
// Layout
// ============================================================================

/**
 * Three native tabs under the shared "Black Hole GPU" stack header: the demo,
 * the Threads swallow example and a Wikipedia article on the real thing.
 */
export default function BlackHoleGpuLayout() {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Black Hole GPU" />,
        }}
      />
      <NativeTabs tintColor="#fff" backgroundColor="#1a1a1a">
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Demo</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="circle.circle.fill" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="threads">
          <NativeTabs.Trigger.Label>Threads</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="at" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="wiki">
          <NativeTabs.Trigger.Label>Wiki</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="globe" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
