import { Image } from "expo-image";
import { Href, Link } from "expo-router";
import LottieView from "lottie-react-native";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { TECH_TAGS, type TechTag } from "./techTags";
import FastSquircleView from "react-native-fast-squircle";

const LOTTIE_ASSETS = {
  "wabi-and-more.json": require("../../../assets/lottie/wabi-and-more_dark.json"),
  "liquid-metal.json": require("../../../assets/lottie/liquid-metal_dark.json"),
  "live-border.json": require("../../../assets/lottie/live-border_dark.json"),
  "ripple.json": require("../../../assets/lottie/ripple_dark.json"),
  "scale-flip-card.json": require("../../../assets/lottie/scale-flip-card_dark.json"),
} as const;
const BACKGROUND_COLOR = "#1a1a1a";

export type Demo = {
  name: string;
  href: Href;
  tags: TechTag[];
  lottieLink?: keyof typeof LOTTIE_ASSETS;
};

export default function DemoCardView({
  demo,
}: {
  demo: Demo;
}) {
  const lottie = demo.lottieLink ? LOTTIE_ASSETS[demo.lottieLink] : null;
  const { width, height } = useWindowDimensions();

  return (
    <Link href={demo.href} asChild>
      <Pressable
        style={{
          width: width / 2.25,
          height: height / 4,
          justifyContent: "center",
        }}
      >
      <FastSquircleView
        cornerSmoothing={0.6}
        style={styles.card}
      >
        <Text style={styles.cardTitle}>{demo.name}</Text>
        {lottie && (
          <LottieView
            autoPlay
            // ref={animation}
            style={{
              width: 100,
              height: 100,
              backgroundColor: BACKGROUND_COLOR,
            }}
            source={lottie}
          />
        )}
        <View style={styles.tagRow}>
          {demo.tags.map((tag) => (
            <Image
              key={tag}
              source={TECH_TAGS[tag].image}
              contentFit="cover"
              style={styles.tag}
            />
          ))}
        </View>
      </FastSquircleView>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BACKGROUND_COLOR,
    borderRadius: 24,
    gap: 12,
    padding: 18,
    height: "100%",
    width: "100%",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",

  },
  cardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  tagRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  tag: {
    width: 50,
    height: 25,
    borderWidth: 1,
    borderColor: "rgb(66, 66, 66)",
    borderRadius: 4,
  },
});
