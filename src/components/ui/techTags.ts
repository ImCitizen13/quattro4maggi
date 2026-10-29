import type { ImageSourcePropType } from "react-native";

export type TechTagInfo = { color: string; image: ImageSourcePropType };

export const TECH_TAGS = {
  reanimated: { color: "#6a539a", image: require("../../../assets/tags/reanimated.png") },
  skia: { color: "#000000", image: require("../../../assets/tags/skia.png") },
  "type-gpu": { color: "#000000", image: require("../../../assets/tags/type-gpu-tag.png") },
} as const satisfies Record<string, TechTagInfo>;

export type TechTag = keyof typeof TECH_TAGS;
