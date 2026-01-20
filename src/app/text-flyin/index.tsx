import {
  KineticText,
  KineticTextHandle,
} from "@/components/text-flyin/TextCanvas";
import { ThemeButton, ThemeHeaderTitle } from "@/components/Theme";
import { Host, Slider, Switch, VStack } from "@expo/ui/swift-ui";
import { disabled, opacity, padding } from "@expo/ui/swift-ui/modifiers";
import { Stack } from "expo-router";
import React, { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TextFlyinDemo() {
  const textRef = useRef<KineticTextHandle>(null);
  const [sliderValue, setSliderValue] = useState(0);
  const [checked, setChecked] = useState(false);
  const [lagChecked, setLagChecked] = useState(false);


  const useAnimatedProgress = useDerivedValue(() => {
    return sliderValue;
  });
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
          text="motivation"
          fontSize={48}
          color="#fff"
          staggerDelay={0.08}
          duration={Math.max(1000, sliderValue * 5000)}
          autoStart={false}
          progress={useAnimatedProgress}
          withSliderControl={checked}
          laggy={lagChecked}
          onAnimationStart={() => {
            "worklet";
            // console.log("Animation started");
          }}
          onAnimationComplete={() => {
            "worklet";
            // console.log("Animation completed");
          }}
        />
        {/* <KineticText
          ref={textRef}
          text="motivation"
          fontSize={48}
          color="#646799"
          bgcolor="#D1D1D1"
          staggerDelay={0.08}
          duration={Math.max(1000, sliderValue * 5000)}
          autoStart={false}
          progress={useAnimatedProgress}
          withSliderControl={checked}
          onAnimationStart={() => {
            "worklet";
            // console.log("Animation started");
          }}
          onAnimationComplete={() => {
            "worklet";
            // console.log("Animation completed");
          }}
        /> */}

        {/* <KineticText/> */}
      </View>

      <View style={styles.controls}>
        <ThemeButton text="Start" onPress={() => textRef.current?.start()} />

        <ThemeButton text="Reset" onPress={() => textRef.current?.reset()} />
      </View>

      <View style={styles.durationContainer}>
        <Host style={{ width: "80%", height: 100 }}>
          <VStack
            modifiers={[
              // glassEffect({
              //   glass: {
              //     variant: "regular",
              //     interactive: true,
              //     // tint: "#ffffff",
              //   },
              //   shape: "rectangle",
              // }),
              padding({ all: 10 }),
            ]}
            spacing={10}
          >
            <Switch
              value={lagChecked}
              onValueChange={(checked) => {
                setLagChecked(checked);
              }}
              color="purple"
              label="Make it laggy"
              variant="switch"
            />
            <Switch
              value={checked}
              onValueChange={(checked) => {
                setChecked(checked);
              }}
              color="purple"
              label="Use Slider"
              variant="switch"
            />
            <Slider
              max={1}
              min={0}
              value={sliderValue}
              onValueChange={(value) => {
                setSliderValue(value);
              }}
              color="purple"
              modifiers={[opacity(checked ? 1 : 0.5), disabled(!checked)]}
            />


          </VStack>
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
