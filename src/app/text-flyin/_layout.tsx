import { ThemeHeaderTitle } from "@/components/Theme";
import { HeaderBackButton } from "@react-navigation/elements";
import { Stack, router } from "expo-router";

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerStyle: { backgroundColor: "#1a1a1a" },
          headerTitle: () => <ThemeHeaderTitle text="Text Flyin" />,
          headerLeft: () => (
            <HeaderBackButton tintColor="#fff" onPress={() => router.back()} />
          ),
        }}
      />
    </Stack>
  );
}
