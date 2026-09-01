import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import React, { useEffect, useState } from "react";
import { Canvas } from "@shopify/react-native-skia";
import StarsShader from "../../shaders/StarsShader";
import { EaseView } from "react-native-ease";

const START_CREDIT_TEXT = [
  [
    "War! The Republic is crumbling under attacks by the",
    "ruthless Sith Lord, Count Dooku. There are heroes on",
    "both sides. Evil is everywhere.",
  ],
  [
    "In a stunning move, the fiendish droid leader, General",
    "Grievous, has swept into the Republic capital and",
    "kidnapped Chancellor Palpatine, leader of the Galactic",
    "Senate.",
  ],
  [
    "As the Separatist Droid Army attempts to flee the",
    "besieged capital with their valuable hostage, two Jedi",
    "Knights lead a desperate mission to rescue the captive",
    "Chancellor....",
  ],
];

const TITLE_ANIMATION_DURATION = 10000;
const CRAWL_ANIMATION_DURATION = 10000;

const TitleAnimatedView = ({
  title,
  runId,
}: {
  title: string;
  runId: number;
}) => {
  return (
    <EaseView
      key={`title-${runId}`}
      initialAnimate={{ scale: 10 }}
      style={[
        styles.titleView,
        { flex: 1, justifyContent: "center", alignItems: "center" },
      ]}
      animate={{ scale: 0.2, opacity: 0 }}
      transition={{
        type: "timing",
        duration: TITLE_ANIMATION_DURATION,
        easing: "easeInOut",
      }}
    >
      <Text style={styles.mainTitle}>Star{"\n"}Wars</Text>
    </EaseView>
  );
};

const CreditTextAnimatedView = ({
  textArray,
  width,
  runId,
  height,
}: {
  textArray: string[];
  runId: number;
  height: number;
  width: number;
}) => {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        // bottom: 100,
        left: 0,
        width: width,
        height: height * 0.65,
        alignItems: "center",
        justifyContent: "flex-end",
        transform: [{ perspective: 500 }, { rotateX: "55deg" }],
        zIndex: 50,
      }}
    >
      <EaseView
        key={`crawl-${runId}`}
        initialAnimate={{ translateY: 0 }}
        animate={{ translateY: -height * 1.5 }}
        transition={{
          delay: TITLE_ANIMATION_DURATION,
          type: "timing",
          duration: CRAWL_ANIMATION_DURATION,
          easing: "linear",
        }}
        style={{ width: "70%", alignItems: "center" }}
      >
        {START_CREDIT_TEXT.map((paragraph, i) => (
          <Text key={i} style={styles.crawlText}>
            {paragraph.join("\n")}
            {"\n\n"}
          </Text>
        ))}
      </EaseView>
    </View>
  );
};

export default function StarWarsCredits({
  width,
  height,
  onCrawlComplete,
}: {
  width: number;
  height: number;
  onCrawlComplete?: () => void;
}) {
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (!onCrawlComplete) return;
    const totalMs = TITLE_ANIMATION_DURATION + CRAWL_ANIMATION_DURATION;
    const t = setTimeout(onCrawlComplete, totalMs);
    return () => clearTimeout(t);
  }, [runId, onCrawlComplete]);

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Title Animation */}
      {/* <TitleAnimatedView title="Star Wars" runId={runId} /> */}
      {/* Credit text — tilt on the outer view, scroll on the inner view */}
      <CreditTextAnimatedView
        textArray={START_CREDIT_TEXT.flat()}
        width={width}
        runId={runId}
        height={height}
      />

      {/* <Canvas style={{ width: width, height: height }}>
        <StarsShader width={width} height={height} />
      </Canvas> */}
      {/* <Pressable
        style={styles.restartButton}
        onPress={() => setRunId((n) => n + 1)}
      >
        <Text style={styles.restartButtonText}>Restart</Text>
      </Pressable> */}
    </View>
  );
}

const styles = StyleSheet.create({
  titleView: {
    // position: "absolute",
    // zIndex: 99,
    backgroundColor: "transparent",
  },
  mainTitle: {
    textAlign: "center",
    fontFamily: "Starjhol",
    fontSize: 64,
    color: "rgb(216, 201, 36)",
    lineHeight: 70,
  },
  crawlText: {
    textAlign: "justify",
    // fontFamily: "Starjhol",
    fontSize: 12,
    color: "rgb(33, 148, 255)",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  restartButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
    zIndex: 100,
  },
  restartButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
