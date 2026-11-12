import Mapbox from "@rnmapbox/maps";
import Navigation from "@rnmapbox/navigation";
import { mapboxProvider } from "../map/mapboxProvider";
import type { Route } from "@rnmapbox/navigation";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        mapboxAccessToken: "pk.rova-test-token",
        mapboxTrafficEnabled: false,
      },
    },
  },
}));

jest.mock("@rnmapbox/maps", () => ({
  __esModule: true,
  default: {
    setAccessToken: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("@rnmapbox/navigation", () => ({
  __esModule: true,
  default: {
    setAccessToken: jest.fn(),
    setRerouteEnabled: jest.fn(),
    setVoiceMuted: jest.fn(),
    requestRoutes: jest.fn(),
    addRouteProgressListener: jest.fn(() => ({ remove: jest.fn() })),
    addOffRouteListener: jest.fn(() => ({ remove: jest.fn() })),
    addRouteChangeListener: jest.fn(() => ({ remove: jest.fn() })),
    addArriveListener: jest.fn(() => ({ remove: jest.fn() })),
    startActiveGuidance: jest.fn().mockResolvedValue(undefined),
    stopNavigation: jest.fn(),
  },
}));

describe("Mapbox provider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("searches only Ghana through the geocoding provider", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          {
            properties: { mapbox_id: "place.123", name: "Test address", place_formatted: "Accra, Ghana", context: { country: { country_code: "GH" } } },
            geometry: { type: "Point", coordinates: [-0.1702, 5.6148] },
          },
        ],
      }),
    }) as typeof fetch;

    const results = await mapboxProvider.searchDestinations(
      "Accra Mall",
      "search-session",
      [-0.187, 5.6037],
    );

    const requestUrl = new URL(jest.mocked(global.fetch).mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe("/search/geocode/v6/forward");
    expect(requestUrl.searchParams.get("country")).toBe("GH");
    expect(requestUrl.searchParams.has("session_token")).toBe(false);
    expect(requestUrl.searchParams.get("proximity")).toBe("-0.187,5.6037");
    expect(results).toEqual([
      {
        id: "place.123",
        name: "Test address",
        detail: "Accra, Ghana",
        coordinate: [-0.1702, 5.6148],
        attribution: "© Mapbox",
      },
    ]);
  });

  it("retrieves a validated destination coordinate", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          {
            geometry: {
              coordinates: [-0.1702, 5.6148],
            },
          },
        ],
      }),
    }) as typeof fetch;

    const result = await mapboxProvider.retrieveDestination(
      {
        id: "place.123",
        name: "Accra Mall",
        detail: "Accra, Ghana",
        coordinate: [-0.1702, 5.6148],
      },
      "search-session",
    );

    expect(result.coordinate).toEqual([-0.1702, 5.6148]);
  });

  it("requests a standard driving route by default and starts real, voice-guided navigation", async () => {
    const nativeRoute: Route = {
      distance: 4_200,
      expectedTravelTime: 720,
      geometry: {
        type: "LineString",
        coordinates: [
          [-0.187, 5.6037],
          [-0.1702, 5.6148],
        ],
      },
      legs: [],
      isReleased: false,
      release: jest.fn(),
    };
    jest.mocked(Navigation.requestRoutes).mockResolvedValue({
      main: nativeRoute,
      alternatives: [],
    });

    const route = await mapboxProvider.requestRoute(
      [-0.187, 5.6037],
      [-0.1702, 5.6148],
    );

    expect(route.trafficAware).toBe(false);
    expect(route.distanceMeters).toBe(4_200);
    expect(Navigation.requestRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "driving", alternatives: false }),
    );

    const callbacks = {
      onProgress: jest.fn(),
      onOffRoute: jest.fn(),
      onRouteChanged: jest.fn(),
      onArrive: jest.fn(),
    };
    const session = await route.startGuidance(callbacks);

    expect(Navigation.startActiveGuidance).toHaveBeenCalledWith(nativeRoute, {
      simulate: false,
    });
    expect(Navigation.setVoiceMuted).toHaveBeenCalledWith(false);
    session.setVoiceMuted(true);
    expect(Navigation.setVoiceMuted).toHaveBeenLastCalledWith(true);
    session.stop();
    expect(Navigation.stopNavigation).toHaveBeenCalledTimes(1);
    expect(Mapbox.setAccessToken).toHaveBeenCalledWith("pk.rova-test-token");
  });

  it("surfaces API errors instead of turning them into empty search results", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Invalid token" }),
    }) as typeof fetch;

    await expect(
      mapboxProvider.searchDestinations(
        "Accra",
        "search-session",
        [-0.187, 5.6037],
      ),
    ).rejects.toThrow("Search authorization failed");
  });
});
