import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { SVGColorWheel } from "./ColorWheels";

const scaleFactor = 2;
export default function GlowingBorderCard({
  width,
  height,
  colors,
  duration = 2000,
}: {
  width: number;
  height: number;
  colors: string[];
  duration?: number;
}) {
  const rotateX = useSharedValue(0);
  const startAnimation = useSharedValue(false);

  const innerBborderRadius = 16;
  const innerPadding = width * 0.05;
  const outerBorderRadius = innerBborderRadius + innerPadding;
  const [playIcon, setPlayIcon] = useState("play-arrow");

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotateX.value}deg` }],
    };
  });

  useAnimatedReaction(
    () => startAnimation.value,
    (value) => {
      if (value) {
        // Continuous clockwise rotation
        rotateX.value = withRepeat(
          withTiming(360, { duration: duration, easing: Easing.linear }),
          -1, // infinite repeats
          false // no reverse - always clockwise
        );
        scheduleOnRN(setPlayIcon, "pause");
      } else {
        rotateX.value = withTiming(0, { duration: duration / 2 });
        scheduleOnRN(setPlayIcon, "play-arrow");
      }
    }
  );
  return (
    <View
      style={[
        styles.outerContainer,
        { width, height, borderRadius: outerBorderRadius },
      ]}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            width: width * scaleFactor,
            height: height * scaleFactor,
            // Center the 2x view within the parent by offsetting by half the extra size
            left: -width / scaleFactor,
            top: -height / scaleFactor,
          },
          animatedStyle,
        ]}
      >
        <SVGColorWheel
          size={width * 2}
          colors={colors}
          // style={{
          //   width: width * 2,
          //   height: height * 2,
          // }}
          innerRadius={0.3}
        />
        {/* <LinearGradient
          colors={colors as [ColorValue, ColorValue, ...ColorValue[]]}
          style={{
            width: width * 2,
            height: height * 2,
          }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        /> */}
      </Animated.View>
      <PressableScale
        onPress={() => (startAnimation.value = !startAnimation.value)}
        style={[
          styles.innerContent,
          { borderRadius: innerBborderRadius, inset: innerPadding },
        ]}
      >
        <Animated.View entering={FadeIn} exiting={FadeOut}>
          {playIcon === "play-arrow" ? (
            <MaterialIcons name="play-arrow" size={width * 0.3} color="white" />
          ) : (
            <MaterialIcons name="pause" size={width * 0.3} color="white" />
          )}
        </Animated.View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: "relative",
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
  },
  innerContent: {
    position: "absolute",
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "bold",
  },
  button: {
    position: "absolute",
    bottom: 10,

    padding: 10,
    borderWidth: 1,
    borderColor: "white",
    backgroundColor: "black",
    borderRadius: 10,
  },
});
