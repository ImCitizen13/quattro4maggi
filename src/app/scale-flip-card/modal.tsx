import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

export default function modal() {
  return (
    <Modal>
      <View style={{ flex: 1, backgroundColor: "red" }}>
        <Text style={{color: "white", fontSize: 28}}>modal</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({});
