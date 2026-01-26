import LiveBorderCard from "@/components/live-border-card/LiveBorderCard";
import { ThemeView } from "@/components/Theme";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import { ColorValue, StyleSheet, View } from "react-native";
import { FlatList } from "react-native-gesture-handler";
const size = 150;
export default function index() {
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

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [selectedColors, setSelectedColors] = useState<number>(0);
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
