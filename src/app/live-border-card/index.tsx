import AdaptableSkiaLiveBorderCard from "@/components/live-border-card/AdaptableSkiaLiveBorderCard";
import LiveBorderCard from "@/components/live-border-card/LiveBorderCard";
import { AnimatedSkiaRingBorder } from "@/components/live-border-card/SkiaRingBorder";
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
    ["#372516", "#fbd271", "#0f4e77", "#89a377", "#E7bd8b"],
    ["#4285F4", "#DB4437", "#F4B400", "#0F9D58"],
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
      {/* SkiaRingBorder Demo - Animated Ring Border */}
      <View style={{ position: "relative", width: size * 1.5, height: size, }}>
        <AnimatedSkiaRingBorder
          width={size * 2}
          height={size}
          colors={[...colors[selectedColors], colors[selectedColors][0]]}
          strokeWidth={12}
          borderRadius={20}
          rotation={rotation}
        />
        {/* <View
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            bottom: 12,
            backgroundColor: "#2a2a2a",
            borderRadius: 8,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 14 }}>Ring Border</Text>
        </View> */}
      </View>

      <LiveBorderCard
        width={size}
        height={size}
        colors={colors[selectedColors]}
        duration={2500}
      />

      <AdaptableSkiaLiveBorderCard
        width={size * 1.5}
        height={size /2 }
        colors={colors[selectedColors]}
        duration={2500}
        innerPaddingPercentage={0.1}
        showGlow={true}
      />

      <View style={{ height: size * 2 }}>
        <FlatList
          style={{ padding: 16 }}
          contentContainerStyle={{ gap: 20, height: "100%" }}
          data={colors}
          columnWrapperStyle={{ gap: 20 }}
          numColumns={2}
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
