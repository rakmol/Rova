import type { ExpoConfig } from "expo/config";

// Build config runs in Node; this helper is also exercised by CI policy tests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {buildIdentity}=require('./build.config.cjs') as {buildIdentity:()=>{name:string;id:string;scheme:string;version:string;versionCode:number;variant:string}};
const identity=buildIdentity();
const mapboxAccessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
const mapboxTrafficEnabled =
  process.env.EXPO_PUBLIC_MAPBOX_TRAFFIC_ENABLED === "true";
const plugins: ExpoConfig["plugins"] = [
  "expo-router",
  "expo-secure-store",
  ["expo-notifications", {defaultChannel:"rova-road-updates"}],
  "@maplibre/maplibre-react-native",
  ["@rnmapbox/maps", { RNMapboxMapsVersion: "11.33.0" }],
  [
    "@rnmapbox/navigation",
    {
      locationWhenInUsePermission:
        "Allow ROVA to use your location for route previews and turn-by-turn navigation.",
    },
  ],
  [
    "expo-location",
    {
      locationWhenInUsePermission:
        "Allow ROVA to show your location when you choose to locate yourself or navigate.",
    },
  ],
  ["expo-splash-screen",{image:"./assets/images/android-icon-foreground.png",imageWidth:160,resizeMode:"contain",backgroundColor:"#F2F7F6",dark:{backgroundColor:"#0F1C1E"}}],
];

const config: ExpoConfig = {
  name: identity.name,
  slug: "rova",
  scheme: identity.scheme,
  version: identity.version,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  plugins,
  android: {
    package: identity.id,
    versionCode: identity.versionCode,
    ...(process.env.GOOGLE_SERVICES_JSON ? {googleServicesFile:process.env.GOOGLE_SERVICES_JSON} : {}),
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  ios: {
    bundleIdentifier: identity.id,
    icon: "./assets/expo.icon",
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: identity.variant,
    mapboxAccessToken,
    mapboxTrafficEnabled,
    eas: {
      projectId: "349ea2b5-83d4-4d6f-8d4b-ff67a939447d",
    },
  },
};

export default config;
