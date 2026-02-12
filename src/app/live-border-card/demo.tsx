import AdaptableSkiaLiveBorderCard from "@/components/live-border-card/AdaptableSkiaLiveBorderCard";
import { ThemeView } from "@/components/Theme";
import { SimpleLineIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import { PressableScale } from "pressto";
import React from "react";
import { TextInput } from "react-native";

export default function Demo() {
  const { jColors } = useLocalSearchParams<{ jColors: string }>();
  const colors: string[] = JSON.parse(jColors);
  const BASE_SIZE = 175;
  const showGlow = true;
  const glowIntensity = 0.8;
  const glowSpread = 1.3;
  const glowBlurRadius = 20;
  const pulsateGlow = false;
  const starts = [{ x: 0, y: 0 }];
  const ends = [{ x: 0, y: 1 }];
  return (
    <ThemeView style={{ flex: 1, backgroundColor: "0C0C0C"  }}>
      <Image
        source={require("../../../assets/images/particle_sun.jpg")}
        contentFit="contain"
        style={{ width: "80%", height: "80%" }}
      />
      <AdaptableSkiaLiveBorderCard
        width={BASE_SIZE * 2}
        height={BASE_SIZE / 2}
        borderRadius={BASE_SIZE}
        showGlow={showGlow}
        glowIntensity={1}
        glowSpread={glowSpread * 0.9}
        glowBlurRadius={glowBlurRadius}
        colors={colors}
        uniformColors={false}
        pulsateGlow={pulsateGlow}
        pulsateDuration={2000}
      >
        <LinearGradient
          style={{
            width: "100%",
            height: "100%",
            justifyContent: "space-between",
            paddingHorizontal: 18,
            alignItems: "center",
            flexDirection: "row",
            gap: 16,
          }}
          colors={["#2E2E2E", "#000000"]}
          start={starts[0]}
          end={ends[0]}
        >
          <TextInput
            style={{
              flex: 1,
              color: "white",

              padding: 10,
              fontSize: 16,
            }}
            placeholder="Enter your text here"
            placeholderTextColor="rgb(176, 176, 176)"
            cursorColor={colors[3]}
          />
          <PressableScale
            style={{
              padding: 10,
              borderRadius: BASE_SIZE / 2,
              borderWidth: 2,
              borderColor: colors[3],
            }}
          >
            <SimpleLineIcons
              name="ghost"
              size={BASE_SIZE / 8}
              color={colors[3]}
            />
          </PressableScale>
        </LinearGradient>
      </AdaptableSkiaLiveBorderCard>
    </ThemeView>
  );
}
