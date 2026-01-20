import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { PortalProvider } from "@gorhom/portal";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const fontLoaded = useFonts({
    "Satisfy-Regular": require("@/assets/fonts/Satisfy-Regular.ttf"),
    "BebasNeue-Regular": require("@/assets/fonts/BebasNeue-Regular.ttf"),
    "IndieFlower-Regular": require("@/assets/fonts/IndieFlower-Regular.ttf"),
    "LobsterTwo-Regular": require("@/assets/fonts/LobsterTwo-Regular.ttf"),
    "Merriweather": require("@/assets/fonts/Merriweather-VariableFont_opsz,wdth,wght.ttf"),
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PortalProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack>
            {/* <Stack.Screen name="index" options={{ title: 'quattro4maggi' }} />
        <Stack.Screen name="shared-element" options={{ title: 'Shared Element' }} />
        <Stack.Screen name="ripple-shader" options={{ title: 'Ripple Shader' }} />
        <Stack.Screen name="final-ripple" options={{ title: 'Final Ripple' }} />
        <Stack.Screen name="shader-wrapper" options={{ title: 'Shader Wrapper' }} /> */}
            {/* <Stack.Screen
              name="scale-flip-card"
              options={{ title: "Scale Flip Card", headerShown: false }}
            /> */}
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </PortalProvider>
    </GestureHandlerRootView>
  );
}
