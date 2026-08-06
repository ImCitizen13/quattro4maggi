import { ThemeHeaderTitle } from "@/components/Theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { HeaderBackButton } from "@react-navigation/elements";
import { Stack, router } from "expo-router";
import { PressableScale } from "pressto";
import { useColorScheme } from "react-native";

export default function Layout() {
  const isDark = useColorScheme() == "dark";
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerStyle: { backgroundColor: "#1a1a1a" },
          headerTitle: () => <ThemeHeaderTitle text="Liquid Metal" />,
          headerLeft: () => (
            <PressableScale onPress={() => router.back()}>
              <MaterialCommunityIcons
                name="arrow-left"
                color={!isDark ? "#000" : "#fff"}
                size={24}
              />
            </PressableScale>
          ),
        }}
      />
    </Stack>
  );
}
