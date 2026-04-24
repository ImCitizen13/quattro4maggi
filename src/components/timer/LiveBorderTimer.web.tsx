import AdaptableSkiaLiveBorderCard from "@/components/live-border-card/AdaptableSkiaLiveBorderCard";
import TimerContent from "@/components/timer/TimerContent";
import { Host, Slider } from "@expo/ui/swift-ui";
import { tint } from "@expo/ui/swift-ui/modifiers";
import { AntDesign } from "@expo/vector-icons";
import { PressableScale } from "pressto";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const INITIAL_HOURS = .5;
const INITIAL_MINUTES = 0;
const INITIAL_SECONDS = 0;
const INITIAL_TOTAL =
  INITIAL_HOURS * 3600 + INITIAL_MINUTES * 60 + INITIAL_SECONDS;
const BASE_SIZE = 100;

export default function LiveBorderTimer() {
  const colors = ["#ffd700", "#ffffff", "#d4af37", "rgba(0, 0, 0, 0.13)"];

  const [totalSeconds, setTotalSeconds] = useState(INITIAL_TOTAL);
  const [isRunning, setIsRunning] = useState(false);
  const [fontSize, setFontSize] = useState(32);

  const handleStartPause = useCallback(() => {
    if (totalSeconds === 0) return;
    setIsRunning((prev) => !prev);
  }, [totalSeconds]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setTotalSeconds(INITIAL_TOTAL);
  }, []);

  const isFinished = totalSeconds === 0;

  useEffect(()=> {
    console.log("View Refreshed ♻️")
  }, [])
  return (
    <View style={styles.container}>
      <AdaptableSkiaLiveBorderCard
        rotate={isRunning && !isFinished}
        width={BASE_SIZE * 2}
        height={BASE_SIZE * 0.75
        }
        borderRadius={24}
        showGlow={isRunning && !isFinished}
        glowIntensity={10}
        glowSpread={1.2}
        glowBlurRadius={20}
        colors={colors}
        uniformColors={false}
        pulsateGlow={isRunning && !isFinished}
        pulsateDuration={10000}
        duration={10000}
      >
        {/* Time */}
        <TimerContent
          seconds={totalSeconds}
          isRunning={isRunning}
          setSeconds={setTotalSeconds}
          setIsRunning={setIsRunning}
          fontSize={fontSize}
        />
      </AdaptableSkiaLiveBorderCard>

{/* Controls */}
      <View style={styles.controls}>
        <View style={styles.controlsRow}>
          <AntDesign name="font-size" size={24} color="white" />
          <Host style={{ flex: 1 }} matchContents>
            <Slider
              step={8}
              min={8}
              max={48}
              value={fontSize}
              onValueChange={setFontSize}
              modifiers={[
                tint(colors[0]),
              ]}
            />
          </Host>
        </View>
        <View style={styles.controlsRow}>
          <PressableScale onPress={handleStartPause} style={styles.button}>
            <Text style={styles.buttonText}>
              {isFinished ? "—" : isRunning ? "Pause" : "Start"}
            </Text>
          </PressableScale>

          <PressableScale onPress={handleReset} style={styles.button}>
            <Text style={styles.buttonText}>Reset</Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    gap: 32,
  },
  timerContent: {
    flex: 1,

    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "rgb(255, 255, 255)",
    fontVariant: ["tabular-nums"],
  },
  label: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
  controls: {
    flexDirection: "column",
    gap: 16,
  },

  controlsRow: {
    flexDirection: "row",
    gap: 16,
  },
  controlsFontSizeText: {
    textAlign: "center",
    fontWeight: "bold",
    color: "rgb(255, 255, 255)",
    fontVariant: ["tabular-nums"],
  },
  button: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
