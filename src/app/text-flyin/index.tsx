import {
  KineticText,
  KineticTextHandle,
} from "@/components/text-flyin/TextCanvas";
import { ThemeButton, ThemeHeaderTitle, ThemeText } from "@/components/Theme";
import { Host, Slider } from "@expo/ui/swift-ui";
import { Stack } from "expo-router";
import React, { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TextFlyinDemo() {
  const textRef = useRef<KineticTextHandle>(null);
  const [sliderValue, setSliderValue] = useState(0);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Text Flyin" />,
        }}
      />

      <View style={styles.demoContainer}>
        <KineticText
          ref={textRef}
          text="Reminders"
          fontSize={48}
          color="#fff"
          staggerDelay={0.08}
          duration={Math.max(1000, sliderValue * 5000)}
          autoStart={false}
          onAnimationStart={() => {
            "worklet";
            // console.log("Animation started");
          }}
          onAnimationComplete={() => {
            "worklet";
            // console.log("Animation completed");
          }}
        />
        {/* <KineticText/> */}
      </View>

      <View style={styles.controls}>
        <ThemeButton text="Start" onPress={() => textRef.current?.start()} />

        <ThemeButton text="Reset" onPress={() => textRef.current?.reset()} />
      </View>

      <View style={styles.durationContainer}>
        <ThemeText
          text={`Duration: ${Math.max(1000, sliderValue * 5000).toFixed(1).toString()}ms`}
        />
        <Host style={{ width: "80%", height: 100 }}>
          <Slider
            value={sliderValue}
            onValueChange={(value) => {
              setSliderValue(value);
            }}
            color="purple"
          />
        </Host>
      </View>
      {/* <SkiaMorphingButton /> */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "black",
    padding: 10,
    gap: 20,
  },
  demoContainer: {
    marginVertical: 40,
    width: "100%",
    alignItems: "center",
    gap: 20,
  },
  controls: {
    flexDirection: "row",
    gap: 12,
    marginTop: 40,
  },
  button: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  durationContainer: {
    width: "100%",
    alignItems: "center",
    flexDirection: "column",
    gap: 5,
    marginTop: 40,
  },
});
