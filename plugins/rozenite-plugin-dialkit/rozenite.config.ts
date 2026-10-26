import type { RozeniteConfig } from "@rozenite/vite-plugin";

export default {
  panels: [{ name: "Dials", source: "./src/panel.tsx" }],
  integrations: ["react-native"],
} satisfies RozeniteConfig;
