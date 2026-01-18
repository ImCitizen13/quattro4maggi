import { SPRING_BOUNCE_ANIMATION } from "@/lib/animations/constants";
import React, { useEffect } from "react";
import {
  Dimensions,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

interface BounceAnimationProps {
  animationDelay?: number;
}

export function BounceAnimation({ animationDelay = 2000 }: BounceAnimationProps) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // Calculate individual delays based on total animation time
  const scaleUpDelay = animationDelay / 3; // Each scale up takes 1/3 of total time
  const scaleDownDelay = animationDelay /2;    // Scale down happens after full delay

  useEffect(() => {
    translateY.value = withSpring(
      300,
      SPRING_BOUNCE_ANIMATION,
      (finished) => {
        if (finished) {
          scale.value = withSequence(
            withSpring(2, SPRING_BOUNCE_ANIMATION),
            withDelay(scaleUpDelay, withSpring(4, SPRING_BOUNCE_ANIMATION)),
            withDelay(
              scaleUpDelay,
              withSpring((Math.max(width, height) / 100) + 2, SPRING_BOUNCE_ANIMATION)
            ),
            withDelay(scaleDownDelay, withSpring(1, SPRING_BOUNCE_ANIMATION))
          );
        }
      }
    );
  }, [animationDelay, scaleUpDelay, scaleDownDelay]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }, { scale: scale.value }],
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.circle, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 50,
  },
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#333",
  },
});
