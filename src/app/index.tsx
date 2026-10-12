import DemoCardView, { type Demo } from "@/components/ui/DemoCardView";
import { router, Stack } from "expo-router";
import {
  FlatList,
  type ListRenderItem,
  StyleSheet,
  useColorScheme,
} from "react-native";

const demos = [
  {
    name: "Wabi and More",
    href: "/wabi-and-more",
    tags: ["skia", "reanimated"],
    lottieLink: "wabi-and-more.json",
  },
  {
    name: "Ripple Effect",
    href: "/ripple-effect",
    tags: ["skia", "reanimated"],
    lottieLink: "ripple.json",
  },
  {
    name: "Scale Flip Card",
    href: "/scale-flip-card",
    tags: ["reanimated"],
    lottieLink: "scale-flip-card.json",
  },
  {
    name: "Live Border Card",
    href: "/live-border-card",
    tags: ["skia", "reanimated"],
    lottieLink: "live-border.json",
  },
  {
    name: "Liquid Metal",
    href: "/liquid-metal",
    tags: ["skia", "reanimated"],
    lottieLink: "liquid-metal.json",
  },
  {
    name: "Pull To Refresh",
    href: "/pull-to-refresh",
    tags: ["reanimated"],
  },

  {
    name: "Gargantua",
    href: "/gargantua-type-gpu",
    tags: ["reanimated", "type-gpu"],
  },
  {
    name: "Soap Film",
    href: "/soap-film",
    tags: ["skia", "reanimated"],
  },
  {
    name: "Liquid Bubble Live",
    href: "/liquid-bubble-live",
    tags: ["skia", "reanimated"],
  },
  {
    name: "Liquid Bubble Interaction",
    href: "/liquid-bubble-interaction",
    tags: ["skia", "reanimated"],
  },
] satisfies Demo[];

export default function HomeScreen() {
  const isDark = useColorScheme() === "dark";
  const renderItem: ListRenderItem<Demo> = ({ item }) => (
    <DemoCardView demo={item} />
  );
  const keyExtractor = (item: Demo) => item.name;
  return (
    <>
      {/*<Text style={[styles.title, { color: isDark ? "white" : "black" }]}>
        Demos
      </Text>*/}
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "What are you looking for?",
            onChangeText: (event) => {
              router.setParams({ query: event.nativeEvent.text });
            },
          },
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, padding: 12 }}
        data={demos}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.grid}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // padding: 14,
    // backgroundColor: #ffffff
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",

    marginVertical: 24,
  },
  columnWrapper: {
    justifyContent: "center",
    gap: 12,
  },
  grid: {
    gap: 12,
  },
});
