import { Image } from "expo-image";
import React from "react";
import { StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import Animated, { AnimatedStyle } from "react-native-reanimated";

type SocialFooterProps = {
  animatedStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  handle: string;
};

export function SocialFooter({ animatedStyle, handle }: SocialFooterProps) {
  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.text}>Follow on</Text>
      <Image
        source={require("../../../assets/icons/x_icon.png")}
        style={styles.icon}
        contentFit="cover"
      />
      <Text style={styles.text}>{handle}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    backgroundColor: "black",
    flexDirection: "row",
    position: "absolute",
    bottom: "10%",
    height: "10%",
    width: "85%",
    borderRadius: 75,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "white",
    textAlign: "center",
    fontFamily: "LexendDeca",
    fontSize: 16,
  },
  icon: {
    width: 24,
    height: 24,
  },
});
