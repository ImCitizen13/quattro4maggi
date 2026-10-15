import DemoCardView, { type Demo } from "@/components/ui/DemoCardView";
import { Stack } from "expo-router";
import {  useState } from "react";
import { type ListRenderItem, StyleSheet } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

const demos = [
  {
    name: "Liquid Bubble Interaction",
    href: "/liquid-bubble-interaction",
    tags: ["skia", "reanimated"],
  },
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
    name: "Black Hole Text",
    href: "/black-hole-text",
    tags: ["skia", "type-gpu"],
  },
] satisfies Demo[];

export default function HomeScreen() {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const q = searchQuery.trim().toLocaleLowerCase();
  const demosData = q
    ? demos.filter((demo) => demo.name.toLowerCase().includes(q))
    : demos;

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
            placeholder: "Search for a demo?",
            onChangeText: (event) => {
              setSearchQuery(event.nativeEvent.text);
            },
          },
        }}
      />

      <Animated.FlatList
        itemLayoutAnimation={LinearTransition}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.container}
        data={demosData}
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
    paddingVertical: 8,
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
    paddingBottom: 16
  },
});
