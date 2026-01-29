import AdaptableSkiaLiveBorderCard from "@/components/live-border-card/AdaptableSkiaLiveBorderCard";
import { ThemeView } from "@/components/Theme";
import { Host, Slider } from "@expo/ui/swift-ui";
import { SimpleLineIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import {
  ColorValue,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { FlatList } from "react-native-gesture-handler";

const BASE_SIZE = 150;

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

  const [selectedColors, setSelectedColors] = useState<number>(0);

  // Card size controls
  const [cardWidth, setCardWidth] = useState<number>(BASE_SIZE);
  const [cardHeight, setCardHeight] = useState<number>(BASE_SIZE);

  // Glow controls
  const [showGlow, setShowGlow] = useState<boolean>(true);
  const [glowIntensity, setGlowIntensity] = useState<number>(0.8);
  const [glowSpread, setGlowSpread] = useState<number>(1.3);
  const [glowBlurRadius, setGlowBlurRadius] = useState<number>(20);

  // Animation controls
  const [uniformColors, setUniformColors] = useState<boolean>(false);
  const [pulsateGlow, setPulsateGlow] = useState<boolean>(false);

  const starts = [{ x: 0, y: 0 }];
  const ends = [{ x: 0, y: 1 }];
  return (
    <ThemeView
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <AdaptableSkiaLiveBorderCard
          width={cardWidth * 2}
          height={cardHeight * 2}
          borderRadius={cardWidth}
          showGlow={showGlow}
          duration={50000}
          glowIntensity={glowIntensity * 2}
          glowSpread={glowSpread * .9}
          glowBlurRadius={glowBlurRadius}
          colors={colors[selectedColors]}
          uniformColors={uniformColors}
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
              cursorColor={colors[selectedColors][3]}
            />
            <PressableScale
              onPress={() => {
                setShowGlow(!showGlow);
                console.log("Pressed");
              }}
              style={{
                padding: 10,
                borderRadius: cardWidth / 2,
                borderWidth: 2,
                borderColor: colors[selectedColors][3],
              }}
            >
              <SimpleLineIcons
                name="ghost"
                size={BASE_SIZE / 8}
                color={colors[selectedColors][3]}
              />
            </PressableScale>
          </LinearGradient>
        </AdaptableSkiaLiveBorderCard>

        {/* <AdaptableSkiaLiveBorderCard
          width={cardWidth}
          height={cardHeight}
          showGlow={showGlow}
          glowIntensity={glowIntensity}
          glowSpread={glowSpread}
          glowBlurRadius={glowBlurRadius}
          colors={colors[selectedColors]}
          uniformColors={uniformColors}
          pulsateGlow={pulsateGlow}
          pulsateDuration={2000}
        >
          <LinearGradient
            style={{ width: "100%", height: "100%" }}
            colors={["#000000", "#ffffff"]}
            start={starts[0]}
            end={ends[0]}
          />
        </AdaptableSkiaLiveBorderCard> */}

        {/* Color Palette Selector */}
        <View
          style={{
            width: "100%",
            minHeight: BASE_SIZE / 1.5 + 32,
            paddingHorizontal: 16,
          }}
        >
          <FlatList
            style={{ width: "100%" }}
            contentContainerStyle={{
              gap: 20,
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
            data={colors}
            horizontal
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item: colorSet, index }) => (
              <PressableScale onPress={() => setSelectedColors(index)}>
                <LinearGradient
                  style={{
                    width: BASE_SIZE / 1.75,
                    height: BASE_SIZE / 1.75,
                    borderRadius: BASE_SIZE * 0.1,
                    borderWidth: 4,
                    borderColor:
                      selectedColors === index ? "white" : "transparent",
                  }}
                  colors={colorSet as [ColorValue, ColorValue, ...ColorValue[]]}
                  start={starts[0]}
                  end={ends[0]}
                />
              </PressableScale>
            )}
          />
        </View>

        {/* Glow, Pulse, Uniform color switches + Glow intensity slider */}
        <View style={styles.switchSection}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Glow</Text>
            <Switch
              value={showGlow}
              onValueChange={setShowGlow}
              trackColor={{ false: "#444", true: "#6644aa" }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.sliderRow}>
            <Text style={styles.switchLabel}>
              Glow intensity: {glowIntensity.toFixed(1)}
            </Text>
            <Host style={styles.sliderHost}>
              <Slider
                min={0}
                max={1}
                value={glowIntensity}
                onValueChange={setGlowIntensity}
                steps={10}
                color="#6644aa"
              />
            </Host>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Pulse</Text>
            <Switch
              value={pulsateGlow}
              onValueChange={setPulsateGlow}
              trackColor={{ false: "#444", true: "#6644aa" }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Uniform colors</Text>
            <Switch
              value={uniformColors}
              onValueChange={setUniformColors}
              trackColor={{ false: "#444", true: "#6644aa" }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </View>
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  controlsContainer: {
    flex: 1,
    width: "100%",
  },
  controlsContent: {
    padding: 16,
    gap: 16,
  },
  sliderLabel: {
    color: "#fff",
    fontSize: 14,
  },
  switchSection: {
    width: "100%",
    maxWidth: 280,
    gap: 12,
    paddingHorizontal: 16,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: {
    color: "#fff",
    fontSize: 16,
  },
  sliderRow: {
    width: "100%",
    gap: 6,
  },
  sliderHost: {
    width: "100%",
    height: 40,
  },
});

// Controls Panel
// <ScrollView
//   style={styles.controlsContainer}
//   contentContainerStyle={styles.controlsContent}
// >

//   {/* Shape Controls */}
//   <Section title="Shape">
//     <View style={styles.sliderRow}>
//       <Text style={styles.sliderLabel}>Width: {cardWidth}</Text>
//       <Slider
//         value={cardWidth}
//         onValueChange={setCardWidth}
//         min={100}
//         max={300}
//         steps={20}
//       />
//     </View>
//     <View style={styles.sliderRow}>
//       <Text style={styles.sliderLabel}>Height: {cardHeight}</Text>
//       <Slider
//         value={cardHeight}
//         onValueChange={setCardHeight}
//         min={100}
//         max={300}
//         steps={20}
//       />
//     </View>
//   </Section>

//   {/* Glow Controls */}
//   <Section title="Glow">
//     <Switch
//       label="Show Glow"
//       value={showGlow}
//       onValueChange={setShowGlow}
//     />
//     <View style={styles.sliderRow}>
//       <Text style={styles.sliderLabel}>Intensity: {glowIntensity.toFixed(1)}</Text>
//       <Slider
//         value={glowIntensity}
//         onValueChange={setGlowIntensity}
//         min={0}
//         max={1}
//         steps={10}
//       />
//     </View>
//     <View style={styles.sliderRow}>
//       <Text style={styles.sliderLabel}>Spread: {glowSpread.toFixed(1)}</Text>
//       <Slider
//         value={glowSpread}
//         onValueChange={setGlowSpread}
//         min={1}
//         max={2}
//         steps={10}
//       />
//     </View>
//     <View style={styles.sliderRow}>
//       <Text style={styles.sliderLabel}>Blur: {glowBlurRadius}</Text>
//       <Slider
//         value={glowBlurRadius}
//         onValueChange={setGlowBlurRadius}
//         min={5}
//         max={50}
//         steps={9}
//       />
//     </View>
//   </Section>

//   {/* Color Mode Controls */}
//   <Section title="Color Mode">
//     <Switch
//       label="Uniform Colors"
//       value={uniformColors}
//       onValueChange={setUniformColors}
//     />
//     <Switch
//       label="Pulsate Glow"
//       value={pulsateGlow}
//       onValueChange={setPulsateGlow}
//     />
//   </Section>
// </ScrollView>
