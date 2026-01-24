import LiveBorderCard from "@/components/live-border-card/LiveBorderCard";
import { ThemeView } from "@/components/Theme";
import React from "react";
import { StyleSheet } from "react-native";

export default function index() {
  return (
    <ThemeView style={{flex: 1}}>
      <LiveBorderCard width={200} height={200}/>
    </ThemeView>
  );
}

const styles = StyleSheet.create({

});
