import { View, StyleSheet} from "react-native";
import { NEON_COLORS } from "../constants";
import Animated, { interpolate, interpolateColor, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { useRefreshLifecycle } from "../RefreshLifecycleContext";

export default function NeonItemView({ index,  }: { index: number }) {
  const borderColor = NEON_COLORS[index % NEON_COLORS.length];
  const { phase, outcome } = useRefreshLifecycle();
  const flash = useSharedValue(0); // 0 = black, 1 = neon

  useAnimatedReaction(
    () => phase.value,
    (cur, prev) => {
      if (cur === prev) return;
      if (cur === "settling" && outcome.value === "success") {
        // ripple: each row lights a beat after the one above, then fades back
        flash.value = withDelay(
          index * 100,
          withSequence(
            withTiming(1, { duration: 600 }),
            withTiming(0, { duration: 600 }),
          ),
        );
      }
    },
  );

  const animated = useAnimatedStyle(() => ({
    width: `${interpolate(flash.value, [0, 1], [90, 100])}%`,
    height: interpolate(flash.value, [0,1], [100, 110])
  }));

  return <Animated.View
    style={[styles.itemStyle, animated,  { borderColor: borderColor }]}
  />
}

const styles = StyleSheet.create({
  itemStyle: {
    width: "90%",
    borderWidth: 2,
    height: 100,
    alignSelf: "center",
    // backgroundColor: "purple",
  },
});
