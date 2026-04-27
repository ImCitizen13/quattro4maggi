import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import Splash from "@/components/common/Splash";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { PortalProvider } from "@gorhom/portal";
import { useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const fontLoaded = useFonts({
    "Satisfy-Regular": require("@/assets/fonts/Satisfy-Regular.ttf"),
    "BebasNeue-Regular": require("@/assets/fonts/BebasNeue-Regular.ttf"),
    "IndieFlower-Regular": require("@/assets/fonts/IndieFlower-Regular.ttf"),
    "LobsterTwo-Regular": require("@/assets/fonts/LobsterTwo-Regular.ttf"),
    LexendDeca: require("@/assets/fonts/LexendDeca-VariableFont_wght.ttf"),
    Merriweather: require("@/assets/fonts/Merriweather-VariableFont_opsz,wdth,wght.ttf"),
  });

  const [isAnimationDone, setIsAnimationDone] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const onAnimationFinish = () => {
    setShowSplash(false);
  };

  const onExitComplete = () => {
    setIsAnimationDone(true);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PortalProvider>
        {showSplash && (
          <Splash
            onAnimationFinish={onAnimationFinish}
            onExitComplete={onExitComplete}
          />
        )}
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack>
            <Stack.Screen
              name="index"
              options={{ headerShown: false, title: "Demos" }}
            />
            <Stack.Screen
              name="bouncy-scale-ball"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="liquid-metal"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="live-border-card"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ripple-effect"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="scale-flip-card"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="select-from-list"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="text-flyin"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="wabi-and-more"
              options={{ headerShown: false }}
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </PortalProvider>
    </GestureHandlerRootView>
  );
}
