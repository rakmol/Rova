import type { RouteProgressEvent } from "@rnmapbox/navigation";

export type MapCoordinate = [longitude: number, latitude: number];

export type MapLineString = {
  type: "LineString";
  coordinates: MapCoordinate[];
};

export type DestinationSuggestion = {
  id: string;
  name: string;
  detail: string;
  coordinate?: MapCoordinate;
  attribution?: string;
};

export type Destination = {
  name: string;
  detail: string;
  coordinate: MapCoordinate;
};

export type NavigationCallbacks = {
  onProgress: (progress: RouteProgressEvent) => void;
  onOffRoute: (offRoute: boolean) => void;
  onRouteChanged: () => void;
  onArrive: () => void;
};

export type NavigationSession = {
  setVoiceMuted: (muted: boolean) => void;
  stop: () => void;
};

export type MapRoute = {
  origin: MapCoordinate;
  destination: MapCoordinate;
  geometry: MapLineString;
  distanceMeters: number;
  durationSeconds: number;
  trafficAware: boolean;
  startGuidance: (callbacks: NavigationCallbacks) => Promise<NavigationSession>;
  release: () => void;
};

export type MapProvider = {
  initialize: () => Promise<void>;
  searchDestinations: (
    query: string,
    sessionToken: string,
    proximity: MapCoordinate,
    signal?: AbortSignal,
  ) => Promise<DestinationSuggestion[]>;
  retrieveDestination: (
    suggestion: DestinationSuggestion,
    sessionToken: string,
    signal?: AbortSignal,
  ) => Promise<Destination>;
  requestRoute: (
    origin: MapCoordinate,
    destination: MapCoordinate,
  ) => Promise<MapRoute>;
};
