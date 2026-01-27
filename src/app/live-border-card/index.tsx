import AdaptableSkiaLiveBorderCard from "@/components/live-border-card/AdaptableSkiaLiveBorderCard";
import LiveBorderCard from "@/components/live-border-card/LiveBorderCard";
import { ThemeView } from "@/components/Theme";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "pressto";
import React, { useEffect, useState } from "react";
import { ColorValue, StyleSheet, View } from "react-native";
import { FlatList } from "react-native-gesture-handler";
import {
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
const size = 150;
export default function Index() {
  const colors: string[][] = [
    ["#1E3163", "#2D46B9", "#F037A5", "#F8F8F8"],
    ["#372516", "#fbd271", "#0f4e77", "#89a377", "#E7bd8b"],
    ["#4285F4", "#DB4437", "#F4B400", "#0F9D58"],
    ["#0F2854", "#1C4D8D", "#4988C4", "#BDE8F5"],
    ["#000000", "#9929EA", "#FF5FCF", "#FAEB92"],
    ["#FF8F8F", "#FFF1CB", "#C2E2FA", "#B7A3E3"],
    ["#5409DA", "#4E71FF", "#8DD8FF", "#BBFBFF"],
  ];

  const getColorsLocation = (numColors: number) => {
    const locations = Array(numColors)
      .fill(0)
      .map((_, index) => index / (numColors - 1));

    return locations as [number, number, ...number[]];
  };

  const [selectedColors, setSelectedColors] = useState<number>(0);

  // Animated rotation for SkiaRingBorder
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 2500, easing: Easing.linear }),
      -1, // infinite
      false // no reverse
    );
  }, []);

  const starts = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const ends = [
    { x: 0, y: 1 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  return (
    <ThemeView
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <LiveBorderCard
        width={size}
        height={size}
        colors={colors[selectedColors]}
        duration={2500}
      />

      <AdaptableSkiaLiveBorderCard
        width={size}
        height={size}
        colors={colors[selectedColors]}
        duration={2500}
        innerPaddingPercentage={0.05}
        showGlow={true}
        glowIntensity={0.5}
        glowSpread={.5}
      >
        <LinearGradient
          style={{ width: "100%", height: "100%" }}
          colors={["#000000", "#ffffff"]}
          start={starts[0]}
          end={ends[0]}
        />
      </AdaptableSkiaLiveBorderCard>

      <View style={{ height: size * 2 }}>
        <FlatList
          style={{ flex: 1, padding: 16 }}
          contentContainerStyle={{ flex: 1, gap: 20 }}
          data={colors}
          columnWrapperStyle={{ gap: 20 }}
          numColumns={3}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item: colors, index }) => (
            <PressableScale onPress={() => setSelectedColors(index)}>
              <LinearGradient
                style={{
                  width: size / 1.5,
                  height: size / 1.5,
                  marginBottom: 10,
                  borderRadius: size * 0.1,
                  borderWidth: 4,
                  borderColor:
                    selectedColors === index ? "white" : "transparent",
                }}
                colors={colors as [ColorValue, ColorValue, ...ColorValue[]]}
                start={starts[0]}
                end={ends[0]}
                // locations={getColorsLocation(colors.length)}
              />
            </PressableScale>
          )}
        />
      </View>
    </ThemeView>
  );
}

const styles = StyleSheet.create({});
