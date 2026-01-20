import { PressableScale } from "pressto";
import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

export default function Theme() {
  return (
    <View>
      <Text>Theme</Text>
    </View>
  );
}

export const ThemeView = ({
  children,
  style
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  return (
    <View style={[styles.container, styles.centerAlignment, style]}>
      {children}
    </View>
  );
};

export const ThemeHeaderTitle = ({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) => {
  return (
    <View style={styles.header}>
      <ThemeText text={text} style={[styles.title, style]} />
    </View>
  );
};

export const ThemeText = ({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) => {
  return <Text style={[styles.text, style]}>{text}</Text>;
};

export const ThemeButton = ({
  text,
  children,
  style,
  onPress,
}: {
  style?: StyleProp<ViewStyle>;
  text?: string;
  children?: React.ReactNode;
  onPress: () => void;
}) => {
  return (
    <PressableScale style={[styles.button, style]} onPress={onPress}>
      <Text style={styles.buttonText}>{text}</Text>
      {children}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    // flex: 1,
    backgroundColor: "black",
    padding: 10,
  },
  centerAlignment: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    // marginBottom: 20,
  },
  title: {
    fontSize: 30,
    // marginBottom: 40,
    fontWeight: "bold",
    color: "white",
  },
  button: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "purple",
    borderRadius: 10,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  text: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Merriweather",
  },
});
