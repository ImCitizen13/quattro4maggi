import DemoCardView, { Demo } from "@/components/ui/DemoCardView";
import { FlatList, StyleSheet, Text, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const demos: Demo[] = [
  {
    name: "Wabi and More",
    href: "/wabi-and-more" as const,
    tags: [
      { name: "skia", color: "green" },
      { name: "reanimated", color: "#6a539a" },
    ],
    lottieLink: "wabi-and-more.json"
  },
  {
    name: "Ripple Effect",
    href: "/ripple-effect" as const,
    tags: [
      { name: "skia", color: "green" },
      { name: "reanimated", color: "#6a539a" },
    ],
    lottieLink: "ripple.json"
  },
  {
    name: "Scale Flip Card",
    href: "/scale-flip-card" as const,
    tags: [{ name: "reanimated", color: "#6a539a" }],
    lottieLink: "scale-flip-card.json"
  },
  {
    name: "Live Border Card",
    href: "/live-border-card" as const,
    tags: [
      { name: "skia", color: "green" },
      { name: "reanimated", color: "#6a539a" },
    ],
    lottieLink: "live-border.json"
  },
  {
    name: "Liquid Metal",
    href: "/liquid-metal" as const,
    tags: [
      { name: "skia", color: "green" },
      { name: "reanimated", color: "#6a539a" },
    ],
    lottieLink: "liquid-metal.json"
  },
];

export default function HomeScreen() {
  const isDark = useColorScheme() === "dark"; 
  return (
    <SafeAreaView style={styles.container}>
      <Text style={[styles.title, {color: isDark ? "white" : "black"}]}>Demos</Text>
      <FlatList
        style={{ flex: 1 }}
        data={demos}
        numColumns={2}
        columnWrapperStyle={{
          justifyContent: "space-between"
        }}
        renderItem={({ index, item }) => (
          <DemoCardView index={index} demo={item} />
        )}
        contentContainerStyle={styles.grid}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    
    marginVertical: 24,
  },
  grid: {
    gap: 12,
  },
});
