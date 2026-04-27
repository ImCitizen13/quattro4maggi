import LottieView from "lottie-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

export default function Splash({
  isDoneLoading,
}: {
  isDoneLoading: () => void;
}) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        margin: 0,
        // backgroundColor: "red"
      }}
    >
      <LottieView
        autoPlay
        loop={false}
        source={require("../../../assets/lottie/q4m-animated-icon.json")}
        resizeMode="cover"
        style={{ width: 150, height: 150 }}
        onAnimationFinish={isDoneLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({});
