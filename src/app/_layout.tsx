import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'quattro4maggi' }} />
        <Stack.Screen name="shared-element" options={{ title: 'Shared Element' }} />
        <Stack.Screen name="ripple-shader" options={{ title: 'Ripple Shader' }} />
        <Stack.Screen name="final-ripple" options={{ title: 'Final Ripple' }} />
        <Stack.Screen name="shader-wrapper" options={{ title: 'Shader Wrapper' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
