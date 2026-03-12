import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

const formatTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export default function Timer({
  seconds,
  isRunning,
  setSeconds,
  setIsRunning,
  fontSize,
}: {
  seconds: number;
  isRunning: boolean;
  setSeconds: React.Dispatch<React.SetStateAction<number>>;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  fontSize: number;
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTimeLeft = seconds > 0;

  useEffect(() => {
    if (isRunning && hasTimeLeft) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev: number) => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, hasTimeLeft]);

  console.log("View Refreshed ♻️")

  const isFinished = seconds === 0;

  return (
    <View style={styles.timerContent}>
      <Text style={[styles.timeText, { fontSize }]}>{formatTime(seconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  timerContent: {
    // flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    // fontWeight: "bold",
    color: "rgb(255, 255, 255)",
    fontVariant: ["tabular-nums"],
  },
  label: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
});
