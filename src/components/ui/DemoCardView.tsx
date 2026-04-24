import { Image } from "expo-image";
import { Href, Link } from "expo-router";
import LottieView from "lottie-react-native";
import { PressableScale } from "pressto";
import React, { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

const LOTTIE_ASSETS = {
  "liquid-metal.json": require("../../../assets/lottie/liquid-metal_dark.json"),
  "live-border.json": require("../../../assets/lottie/live-border_dark.json"),
  "ripple.json": require("../../../assets/lottie/ripple_dark.json"),
  "scale-flip-card.json": require("../../../assets/lottie/scale-flip-card_dark.json"),
} as const;
const BACKGROUND_COLOR = "#1a1a1a";
export type Tag = {
  name: string;
  color: string;
};

export type Demo = {
  name: string;
  href: Href;
  tags: Array<Tag>;
  lottieLink?: keyof typeof LOTTIE_ASSETS;
};

export default function DemoCardView({
  index,
  demo,
}: {
  index: number;
  demo: Demo;
}) {
  const animation = useRef<LottieView>(null);
  const lottie = demo.lottieLink ? LOTTIE_ASSETS[demo.lottieLink] : null;
  return (
    <Link
      style={{
        backgroundColor: "transparent",
        width: 180,
        justifyContent: "center",
      }}
      key={index}
      href={demo.href}
      asChild
    >
      <PressableScale
        style={styles.card}
        onPressIn={() => {
          animation.current?.play();
        }}
        onPressOut={() => {
          animation.current?.pause();
        }}
      >
        <Text style={styles.cardTitle}>{demo.name}</Text>
        {lottie && (
          <LottieView
          autoPlay
            ref={animation}
            style={{
              width: 100,
              height: 100,
              backgroundColor: BACKGROUND_COLOR,
            }}
            source={lottie}
          />
        )}
        <View
          style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}
        >
          {demo.tags.map((tag, idx) => {
            return (
              <View key={idx}>
                <Image
                  source={
                    tag.name == "skia"
                      ? require("../../../assets/tags/skia.png")
                      : require("../../../assets/tags/reanimated.png")
                  }
                  contentFit="cover"
                  style={{
                    width: 50,
                    height: 25,
                    borderWidth: 1,
                    borderColor: "rgb(66, 66, 66)",
                    borderRadius: 4,
                  }}
                />
              </View>
            );
          })}
        </View>
      </PressableScale>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BACKGROUND_COLOR,
    borderRadius: 12,
    gap: 12,
    padding: 20,
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
