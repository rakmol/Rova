import Constants from "expo-constants";
import { createHttpRoutingProvider } from "./provider";
const host = Constants.expoConfig?.hostUri;
const tunnel = __DEV__ && typeof host === "string" && [".on.expo.app", ".exp.direct", ".ngrok-free.app"].some((suffix) => host.endsWith(suffix)) ? `https://${host}/rova-api/routes` : undefined;
export const routingProvider = createHttpRoutingProvider(process.env.EXPO_PUBLIC_ROUTES_API_URL || tunnel);
