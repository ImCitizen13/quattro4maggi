import { MetaballLiquidMetal } from "@/components/liquid-metal/MetaballLiquidMetal";
import { TuningSlider } from "@/components/liquid-metal/TuningSlider";
import { ThemeView } from "@/components/Theme";
import { StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { LOGOS } from "../../../svgs/svgs";

const BUTTON_SIZE = 280;

export default function LiquidMetalScreen() {
  // Live tuning — all drive shader uniforms on the UI thread (no re-render).
  // Stickiness is a fraction of shape depth (consistent across logos). With the
  // density bridge on, Stringiness controls how far the thin strings stretch
  // between separating balls before they snap; higher Spread pulls them apart
  // so the strings actually show.
  // Keep stickiness low: high smooth-max merges the balls into the body so the
  // reform's final convergence bulges and pops. The bridge does the connecting.
  const stickiness = useSharedValue(0.03);
  const spread = useSharedValue(0.95);
  const size = useSharedValue(1);
  const stringiness = useSharedValue(2.6);

  return (
    <ThemeView style={styles.container}>
      <MetaballLiquidMetal
        svgPaths={LOGOS}
        width={BUTTON_SIZE}
        height={BUTTON_SIZE}
        metal="platinum"
        ballCount={9}
        ballSmooth={stickiness}
        spread={spread}
        ballScale={size}
        bridge
        stringiness={stringiness}
        contour={0.6}
        distortion={0.1}
        repetition={0.7}
        speed={1}
      />

      <View style={styles.panel}>
        <TuningSlider label="Stickiness" value={stickiness} min={0} max={3} decimals={2} />
        <TuningSlider label="Spread" value={spread} min={0.1} max={1.5} decimals={2} />
        <TuningSlider label="Size" value={size} min={0.3} max={2} decimals={2} />
        <TuningSlider label="Stringiness" value={stringiness} min={1.2} max={5} decimals={2} />
      </View>
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  panel: {
    paddingHorizontal: 16,
    gap: 14,
  },
});
