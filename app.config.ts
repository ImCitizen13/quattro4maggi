import { ConfigContext, ExpoConfig } from "expo/config";

const version = "1.0.0";
const projectId = "589debc9-d8d1-442d-8309-6599db2f52d7";

export type AppEnv = "development" | "preview" | "production";

const appEnv = (process.env.APP_ENV ?? "production") as AppEnv;

const bundleIdentifier = () => {
  if (appEnv === "development") {
    return "com.meltohamy.quattro4maggidev";
  } else if (appEnv === "preview") {
    return "com.meltohamy.quattro4maggipreview";
  } else {
    return "com.meltohamy.quattro4maggi";
  }
};

const appName = () => {
  if (appEnv === "development") {
    return "quattro4maggi (Dev)";
  } else if (appEnv === "preview") {
    return "quattro4maggi (Prev)";
  } else {
    return "quattro4maggi";
  }
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName(),
  slug: "quattro4maggi",
  version,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "quattro4maggi",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleIdentifier(),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CADisableMinimumFrameDurationOnPhone: true,
    },
    icon: {
      light: "./assets/icons/ios-light.png",
      dark: "./assets/icons/ios-dark.png",
      tinted: "./assets/icons/ios-tinted.png",
    },
  },
  android: {
    package: bundleIdentifier(),
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/icons/adaptive-icon.png",
      backgroundImage: "./assets/icons/adaptive-icon.png",
      monochromeImage: "./assets/icons/adaptive-icon.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    ["expo-router", { root: "./src/app" }],
    [
      "expo-splash-screen",
      {
        image: "./assets/icons/splash-icon-dark.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    "expo-font",
    "expo-image",
    "expo-web-browser",
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: "36.0.0",
          minSdkVersion: 26,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {
      root: "./src/app",
    },
    appEnv,
    eas: {
      projectId,
    },
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: `https://u.expo.dev/${projectId}`,
  },
});
