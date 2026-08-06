import { SPRING_BOUNCE_ANIMATION } from "@/lib/animations/constants";
import { PressableScale } from "pressto";
import React from "react";
import { StyleSheet, Text, useColorScheme, View } from "react-native";
import { Presets, Settings } from "react-native-pulsar";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import AdaptableSkiaLiveBorderCard from "../live-border-card/AdaptableSkiaLiveBorderCard";
Settings.enableSound(false)

type LabeledSwitchProps = {
  leftLabel: string;
  rightLabel: string;
  value: boolean;
  onChange: (value: boolean) => void;
  earlyBadge?: "left" | "right";
};

// const SPRING_CONFIG = {
//   damping: 15,
//   stiffness: 150,
// };

const EarlyLabel = ({ position }: { position: "left" | "right" }) => {
  
  return (
    <View
      style={[
        styles.earlyLabelContainer,
        
        position === "left"
          ? { left: -10, transform: [{ rotate: "-20deg" }] }
          : { right: -10, transform: [{ rotate: "20deg" }] },
      ]}
    >
      <AdaptableSkiaLiveBorderCard
        width={50}
        height={30}
        borderRadius={10}
        showGlow={true}
        glowIntensity={1}
        colors={["#4285F4", "#DB4437", "#F4B400", "#0F9D58"]}
        uniformColors={false}
        pulsateDuration={2000}
      >
        <Text style={styles.badgeText}>early</Text>
      </AdaptableSkiaLiveBorderCard>
    </View>
  );
};

export function LabeledSwitch({
  leftLabel,
  rightLabel,
  value,
  onChange,
  earlyBadge,
}: LabeledSwitchProps) {
  const progress = useSharedValue(value ? 1 : 0);
  const isDark = useColorScheme() == "dark";

  React.useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, SPRING_BOUNCE_ANIMATION);
  }, [value, progress]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 100 }],
  }));

  const leftTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], ["#1a1a1a", "#888"]),
  }));

  const rightTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], ["#888", "#1a1a1a"]),
  }));

  const onSwitch = (choice: boolean) => {
    Presets.latch();
    onChange(choice);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.track, {backgroundColor: isDark ? "#2E2E2E" : "#e0e0e0"}]}>
        <Animated.View style={[styles.indicator, indicatorStyle]} />

        <PressableScale style={styles.option} onPress={() => onSwitch(false)}>
          <Animated.Text style={[styles.label, leftTextStyle]}>
            {leftLabel}
          </Animated.Text>
          {earlyBadge === "left" && <EarlyLabel position="left" />}
        </PressableScale>

        <PressableScale style={styles.option} onPress={() => onSwitch(true)}>
          <Animated.Text style={[styles.label, rightTextStyle]}>
            {rightLabel}
          </Animated.Text>
          {earlyBadge === "right" && <EarlyLabel position="right" />}
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 16,
  },
  track: {
    flexDirection: "row",
    
    borderRadius: 25,
    padding: 4,
    position: "relative",
  },
  indicator: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 100,
    height: 40,
    backgroundColor: "#fff",
    borderRadius: 21,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  option: {
    width: 100,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    fontFamily: "lobster",
  },
  earlyLabelContainer: {
    position: "absolute",
    top: -15,
    zIndex: 10,
  },
});
