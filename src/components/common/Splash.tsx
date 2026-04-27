import LottieView from "lottie-react-native";
import React from "react";
import { StyleSheet } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

type SplashProps = {
  onAnimationFinish: () => void;
  onExitComplete?: () => void;
};

export default function Splash({
  onAnimationFinish,
  onExitComplete,
}: SplashProps) {
  return (
    <Animated.View
      entering={ZoomIn}
      exiting={ZoomOut.withCallback((finished) => {
        "worklet";
        if (finished && onExitComplete) {
          scheduleOnRN(onExitComplete);
        }
      })}
      style={styles.container}
    >
      <LottieView
        autoPlay
        loop={false}
        source={require("../../../assets/lottie/q4m-animated-icon.json")}
        resizeMode="cover"
        style={styles.lottie}
        onAnimationFinish={onAnimationFinish}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    zIndex: 1,
  },
  lottie: {
    width: 150,
    height: 150,
  },
});
