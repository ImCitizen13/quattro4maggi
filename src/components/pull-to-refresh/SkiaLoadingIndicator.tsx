import { Canvas, Circle, Group } from "@shopify/react-native-skia";
import { StyleSheet } from "react-native";
import { SharedValue } from "react-native-reanimated";

export default function SkiaLoadingIndicator({
  progress,
}: {
  progress: SharedValue<number>;
}) {
  return (
    <Canvas
      style={{
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Group>
        <Circle cx={100} cy={100} r={100} color="red">
          <Circle cx={100} cy={100} r={progress} color="orange" />
        </Circle>
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({});
