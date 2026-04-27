import { ThemeHeaderTitle } from "@/components/Theme";
import { HeaderBackButton } from "@react-navigation/elements";
import { Stack, router } from "expo-router";

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1a1a1a" },
        headerLeft: () => (
          <HeaderBackButton tintColor="#fff" onPress={() => router.back()} />
        ),
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <ThemeHeaderTitle text="Live Border Card" />,
        }}
      />
      <Stack.Screen
        name="demo"
        options={{
          headerTitle: () => <ThemeHeaderTitle text="Demo" />,
        }}
      />
    </Stack>
  );
}
