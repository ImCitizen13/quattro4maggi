import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "pressto";
import React from "react";
import { ColorValue, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const innerBborderRadius = 16;
const innerPadding = 10;
const outerBorderRadius = innerBborderRadius + innerPadding;
const GOOGLE_COLORS: ColorValue[] = [
  "#4285F4",
  "#DB4437",
  "#F4B400",
  "#0F9D58",
];
export default function GlowingBorderCard({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const rotateX = useSharedValue(0);
  const startAnimation = useSharedValue(false);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${rotateX.value}deg` },
      ],
    };
  });
  useAnimatedReaction(
    () => startAnimation.value,
    (value) => {
      if (value) {
        // Continuous clockwise rotation
        rotateX.value = withRepeat(
          withTiming(360, { duration: 2000, easing: Easing.linear }),
          -1, // infinite repeats
          false // no reverse - always clockwise
        );
      } else {
        rotateX.value = withTiming(0, { duration: 300 });
      }
    }
  );

  return (
    <View style={[styles.outerContainer, { width, height }]}>
      <Animated.View style={[{ width, height }, animatedStyle]}>
        <LinearGradient
          colors={GOOGLE_COLORS}
          style={{
            width,
            height,
            borderRadius: outerBorderRadius,
          }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      <PressableScale
        onPress={() => (startAnimation.value = !startAnimation.value)}
        style={styles.innerContent}
      >
        <Text style={styles.text}>GlowingBorderCard</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: "relative",
    backgroundColor: "#1a1a1a",
    borderRadius: outerBorderRadius,
  },
  innerContent: {
    position: "absolute",
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: innerBborderRadius,
    inset: innerPadding,
    // padding: innerPadding,
  },
  text: {
    color: "#ffffff",
    fontSize: 16,
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
