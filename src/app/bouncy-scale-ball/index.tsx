import { BounceAnimation } from "@/components/bouncy-scale-ball/BounceAnimation";
import { ThemeHeaderTitle, ThemeView } from "@/components/Theme";
import { colors } from "@/lib/theme/Colors";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

export default function index() {
  return (
    <ThemeView style={styles.container}>
       <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Bouncy Scale Ball" />,
        }}
      />
      <BounceAnimation animationDelay={1500}/>
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.lightBackground,
  },
}); 