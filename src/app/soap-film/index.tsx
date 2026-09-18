import { SoapFilm } from "@/components/soap-film/SoapFilm";
import { ThemeHeaderTitle, ThemeView } from "@/components/Theme";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

export default function Index() {
  return (
    <ThemeView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Soap Film" />,
        }}
      />
      <SoapFilm />
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
