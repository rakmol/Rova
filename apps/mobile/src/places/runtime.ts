import Constants from "expo-constants";
import { createGeoapifyPlacesProvider, createMapboxPlacesProvider } from "./provider";

export const landmarkSearchEnabled = process.env.EXPO_PUBLIC_PLACES_PROVIDER === "geoapify";
const devHost = Constants.expoConfig?.hostUri;
const tunnelProxy = __DEV__ && landmarkSearchEnabled && typeof devHost === "string" && [".on.expo.app", ".exp.direct", ".ngrok-free.app"].some((suffix) => devHost.endsWith(suffix))
  ? `https://${devHost}/rova-api/places/search` : undefined;
export const placesProvider = (landmarkSearchEnabled ? createGeoapifyPlacesProvider : createMapboxPlacesProvider)({
  accessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || Constants.expoConfig?.extra?.mapboxAccessToken,
  proxyUrl: process.env.EXPO_PUBLIC_PLACES_PROXY_URL || tunnelProxy,
  permanentStorage: process.env.EXPO_PUBLIC_PLACES_PERMANENT_STORAGE === "true",
  // The proxy allows 8 seconds upstream; leave room for mobile-network and cold-start latency.
  requestTimeoutMs: 12000,
});
