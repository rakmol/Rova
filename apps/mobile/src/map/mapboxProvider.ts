import { placesProvider } from "../places/runtime";
import Constants from "expo-constants";
import Mapbox from "@rnmapbox/maps";
import Navigation, { type Route } from "@rnmapbox/navigation";
import type {
  Destination,
  DestinationSuggestion,
  MapCoordinate,
  MapLineString,
  MapProvider,
  MapRoute,
  NavigationCallbacks,
  NavigationSession,
} from "./types";

const ACCRA_CENTER: MapCoordinate = [-0.187, 5.6037];


type RuntimeMapboxConfig = {
  accessToken: string;
};

function getRuntimeConfig(): RuntimeMapboxConfig {
  const extra = Constants.expoConfig?.extra;
  const extraToken = extra?.mapboxAccessToken;
  const environmentToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return {
    accessToken:
      (typeof extraToken === "string" && extraToken) ||
      environmentToken ||
      "",
  };
}

export function getMapboxAccessToken(): string {
  return getRuntimeConfig().accessToken;
}

export function isMapboxConfigured(): boolean {
  return getMapboxAccessToken().startsWith("pk.");
}

export function isTrafficAwareRoutingEnabled(): boolean {
  // Ghana live-traffic coverage has not been verified. Never advertise it from an environment toggle.
  return false;
}

export function createSearchSessionToken(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function requireAccessToken(): string {
  const token = getMapboxAccessToken();
  if (!token.startsWith("pk.")) {
    throw new Error(
      "Add a public Mapbox token (pk.) to EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN. Secret tokens cannot be used in the mobile app.",
    );
  }
  return token;
}

let initialization: Promise<void> | undefined;

async function initialize(): Promise<void> {
  const token = requireAccessToken();
  if (!initialization) {
    initialization = (async () => {
      await Mapbox.setAccessToken(token);
      // Only the licensed SDK manages tile cache entries and their expiry. No bulk prefetch.
      await Mapbox.offlineManager?.setMaximumAmbientCacheSize?.(32*1024*1024).catch(()=>{});
      Navigation.setAccessToken(token);
      Navigation.setRerouteEnabled(true);
    })().catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

function toCoordinate(value: unknown): MapCoordinate | null {
  if (
    !Array.isArray(value) ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number" ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    value[0] < -180 ||
    value[0] > 180 ||
    value[1] < -90 ||
    value[1] > 90
  ) {
    return null;
  }
  return [value[0], value[1]];
}

async function searchDestinations(query: string, _sessionToken: string, proximity: MapCoordinate, signal?: AbortSignal): Promise<DestinationSuggestion[]> {
  return placesProvider.autocomplete(query, proximity, signal);
}

async function retrieveDestination(suggestion: DestinationSuggestion, _sessionToken: string): Promise<Destination> {
  if (!suggestion.coordinate) throw new Error("Search again to get a current destination location.");
  return placesProvider.details({ ...suggestion, coordinate: suggestion.coordinate, attribution: suggestion.attribution || "© Mapbox" });
}

function toMapLineString(route: Route): MapLineString {
  const coordinates = route.geometry.coordinates.flatMap((coordinate) => {
    const valid = toCoordinate(coordinate);
    return valid ? [valid] : [];
  });
  if (coordinates.length < 2) {
    throw new Error("Mapbox returned a route without usable road geometry.");
  }
  return { type: "LineString", coordinates };
}

function toNavigationSession(callbacks: NavigationCallbacks): NavigationSession {
  const subscriptions = [
    Navigation.addRouteProgressListener(callbacks.onProgress),
    Navigation.addOffRouteListener(callbacks.onOffRoute),
    Navigation.addRouteChangeListener((event) => {
      callbacks.onRouteChanged();
      event.route.release();
    }),
    Navigation.addArriveListener((event) => {
      if (event.isFinalDestination) {
        callbacks.onArrive();
      }
    }),
  ];
  let stopped = false;

  return {
    setVoiceMuted: (muted) => Navigation.setVoiceMuted(muted),
    stop: () => {
      if (stopped) return;
      stopped = true;
      subscriptions.forEach((subscription) => subscription.remove());
      Navigation.stopNavigation();
    },
  };
}

async function requestRoute(
  origin: MapCoordinate,
  destination: MapCoordinate,
): Promise<MapRoute> {
  await initialize();
  const trafficAware = isTrafficAwareRoutingEnabled();
  const response = await Navigation.requestRoutes({
    waypoints: [origin, destination],
    profile: trafficAware ? "driving-traffic" : "driving",
    alternatives: false,
    language: "en",
    units: "metric",
  });
  response.alternatives.forEach((alternative) => alternative.release());

  let geometry: MapLineString;
  try {
    geometry = toMapLineString(response.main);
  } catch (error) {
    response.main.release();
    throw error;
  }

  return {
    origin,
    destination,
    geometry,
    distanceMeters: response.main.distance,
    durationSeconds: response.main.expectedTravelTime,
    trafficAware,
    startGuidance: async (callbacks) => {
      await initialize();
      const session = toNavigationSession(callbacks);
      try {
        Navigation.setVoiceMuted(false);
        await Navigation.startActiveGuidance(response.main, { simulate: false });
        return session;
      } catch (error) {
        session.stop();
        throw error;
      }
    },
    release: () => response.main.release(),
  };
}

export const mapboxProvider: MapProvider = {
  initialize,
  searchDestinations,
  retrieveDestination,
  requestRoute,
};

export const accraDevelopmentCenter = ACCRA_CENTER;
