import { router } from "expo-router";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentRef } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { ActionButton, ContentFrame, Page, Pill, Surface } from "../../components/ui";
import { HomeBackGuard } from "../../components/HomeBackGuard";
import { RovaIcon } from "../../components/RovaIcon";
import { useRoutePreview } from "../../map/RouteProvider";
import {
  accraDevelopmentCenter,
  createSearchSessionToken,
  isMapboxConfigured,
  mapboxProvider,
} from "../../map/mapboxProvider";
import { MapboxMap } from "../../map/MapboxMap";
import { VehicleSelector } from "../../components/VehicleSelector";
import { travelDistance, useDriverData } from '../../account/local';
import type {
  Destination,
  DestinationSuggestion,
  MapCoordinate,
} from "../../map/types";
import { useRovaTheme } from "../../theme/ThemeProvider";

type SearchState = "idle" | "loading" | "error";

export default function MapScreen() {
  const { theme } = useRovaTheme();
  const { height: screenHeight, fontScale } = useWindowDimensions();
  const mapHeight = Math.max(240, Math.min(390, screenHeight * (fontScale >= 1.5 ? 0.34 : 0.42)));
  const {preferences}=useDriverData();
  const { vehicleType, setVehicleType, route, setRoute, pickedDestination, setPickedDestination, selectedRoutingOption, setSelectedRoutingOption } = useRoutePreview();
  const mapboxConfigured = isMapboxConfigured();
  const sessionToken = useRef(createSearchSessionToken());
  const currentLocationRef = useRef<MapCoordinate | null>(null);
  const pageScrollRef = useRef<ScrollViewInstance>(null);
  const searchFieldRef = useRef<ComponentRef<typeof View>>(null);
  const scrollOffsetRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [center, setCenter] = useState<MapCoordinate>(accraDevelopmentCenter);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapboxConfigured) return;
    let active = true;
    mapboxProvider
      .initialize()
      .then(() => {
        if (active) setMapReady(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setMapError(
            error instanceof Error ? error.message : "Mapbox could not be initialized.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [mapboxConfigured]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!mapboxConfigured || !searchEnabled || trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchState("loading");
      setSearchMessage(null);
      mapboxProvider
        .searchDestinations(
          trimmedQuery,
          sessionToken.current,
          currentLocationRef.current ?? accraDevelopmentCenter,
          controller.signal,
        )
        .then((results) => {
          if (controller.signal.aborted) return;
          setSuggestions(results);
          setSearchState("idle");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof Error && error.name === "AbortError") return;
          setSearchState("error");
          setSearchMessage(
            error instanceof Error ? error.message : "Destination search failed.",
          );
        });
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mapboxConfigured, query, searchEnabled]);

  const buildRoute = useCallback(async (
    destination: Destination,
    origin: MapCoordinate | null = currentLocationRef.current,
  ) => {
    setSelectedRoutingOption(null);
    setRoute(null);
    setRouteError(null);
    setRouteLoading(true);
    const liveOrigin = origin !== null;
    const routeOrigin = origin ?? accraDevelopmentCenter;
    try {
      const mapRoute = await mapboxProvider.requestRoute(
        routeOrigin,
        destination.coordinate,
      );
      setRoute({
        ...mapRoute,
        originIsLive: liveOrigin,
        originLabel: liveOrigin ? "Your location" : "Accra development center",
        destinationLabel: destination.name,
      });
      return mapRoute;
    } catch (error) {
      setRouteError(
        error instanceof Error ? error.message : "A route could not be calculated.",
      );
    } finally {
      setRouteLoading(false);
    }
  }, [setRoute, setSelectedRoutingOption]);

  useEffect(() => {
    if (!pickedDestination) return;
    const frame = requestAnimationFrame(() => {
      setSelectedDestination(pickedDestination);
      setCenter(pickedDestination.coordinate);
      setQuery(pickedDestination.name);
      setSearchEnabled(false);
      setPickedDestination(null);
      void buildRoute(pickedDestination);
    });
    return () => cancelAnimationFrame(frame);
  }, [pickedDestination, setPickedDestination, buildRoute]);

  async function handleSelectDestination(suggestion: DestinationSuggestion) {
    Keyboard.dismiss();
    setSelectingId(suggestion.id);
    setSearchEnabled(false);
    setSuggestions([]);
    setSearchMessage(null);
    try {
      const destination = await mapboxProvider.retrieveDestination(
        suggestion,
        sessionToken.current,
      );
      sessionToken.current = createSearchSessionToken();
      setSelectedDestination(destination);
      setQuery(destination.name);
      setCenter(destination.coordinate);
      await buildRoute(destination);
    } catch (error) {
      setSearchState("error");
      setSearchMessage(
        error instanceof Error ? error.message : "The destination could not be loaded.",
      );
    } finally {
      setSelectingId(null);
    }
  }

  const revealSearchResults = useCallback(() => {
    requestAnimationFrame(() => {
      searchFieldRef.current?.measureInWindow((_x, y) => {
        const topPadding = 96;
        const distanceToScroll = y - topPadding;
        if (distanceToScroll > 0) {
          pageScrollRef.current?.scrollTo({
            y: scrollOffsetRef.current + distanceToScroll,
            animated: true,
          });
        }
      });
    });
  }, []);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      if (searchFocused) revealSearchResults();
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    if (searchFocused) revealSearchResults();
    return () => { shown.remove(); hidden.remove(); };
  }, [searchFocused, revealSearchResults]);

  async function handleLocate() {
    if (!mapboxConfigured) return;
    setLocationStatus(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationEnabled(false);
        setLocationStatus(
          "Location permission is off. You can still preview a route from the Accra development center.",
        );
        return;
      }

      setLocationEnabled(true);
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinate: MapCoordinate = [
        position.coords.longitude,
        position.coords.latitude,
      ];
      currentLocationRef.current = coordinate;
      setCenter(coordinate);
      if (selectedDestination) {
        await buildRoute(selectedDestination, coordinate);
      }
    } catch (error) {
      setLocationStatus(
        error instanceof Error ? error.message : "Your current location is unavailable.",
      );
    }
  }

  const { distanceMeters = 0, durationSeconds = 0, trafficAware = false } = route ?? {};

  return (
    <Page
      scrollRef={pageScrollRef}
      extraBottomPadding={searchFocused ? Math.max(280, keyboardHeight) : 0}
      onScroll={(event) => {
        scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      }}
    >
      <HomeBackGuard />
      <ContentFrame>
        <View style={styles.topBar}>
          <View>
            <Text accessibilityRole="header" style={[styles.brand, { color: theme.colors.brandStrong }]}>rova</Text>
            <Text style={[styles.tagline, { color: theme.colors.inkMuted }]}>
              Move with confidence.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.push("/(tabs)/settings")}
            style={[
              styles.headerButton,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <RovaIcon name="settings" color={theme.colors.brandStrong} size={21} />
          </Pressable>
        </View>

        <View style={styles.exploreHeader}><Text style={[styles.sectionLabel, { color: theme.colors.inkMuted }]}>EXPLORE YOUR AREA</Text><Text style={{ color: theme.colors.inkMuted, fontSize: 12 }}>Accra, Ghana</Text></View>
        <View style={[styles.mapFrame, { height: mapHeight }]}>
          {mapReady ? (
            <MapboxMap
              fill
              center={center}
              destination={selectedDestination?.coordinate}
              locationEnabled={locationEnabled}
              routeGeometry={selectedRoutingOption?.geometry ?? route?.geometry}
              onMapLoaded={() => {
                setMapLoaded(true);
                setMapLoadError(null);
              }}
              onMapError={setMapLoadError}
            />
          ) : (
            <View
              accessibilityRole="summary"
              style={[
                styles.mapPlaceholder,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.mapTitle, { color: theme.colors.ink }]}>
                {mapError
                  ? "Map could not be loaded"
                  : mapboxConfigured
                    ? "Loading the Accra map"
                    : "Mapbox token required"}
              </Text>
              <Text style={[styles.mapDescription, { color: theme.colors.inkMuted }]}>
                {mapError ??
                  (mapboxConfigured
                    ? "Connecting to Mapbox. Check your connection if the map does not appear."
                    : "Add a public pk. token to apps/mobile/.env to load live map tiles and search.")}
              </Text>
            </View>
          )}
          {mapReady && (!mapLoaded || mapLoadError) && (
            <View
              accessibilityRole={mapLoadError ? "alert" : "summary"}
              style={[
                styles.mapNotice,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.mapNoticeTitle, { color: theme.colors.ink }]}>
                {mapLoadError ? "Map tiles unavailable" : "Loading Mapbox streets"}
              </Text>
              <Text style={[styles.mapDescription, { color: theme.colors.inkMuted }]}>
                {mapLoadError ?? "Waiting for map tiles from Mapbox."}
              </Text>
            </View>
          )}
          {mapReady && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Locate me"
              onPress={handleLocate}
              style={[
                styles.locateButton,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <RovaIcon name="locate" color={theme.colors.brandStrong} size={22} />
              <Text style={[styles.locateText, { color: theme.colors.brandStrong }]}>Locate</Text>
            </Pressable>
          )}
        </View>

        <Surface style={styles.destinationCard}>
          <View style={styles.destinationHeading}>
            <Text style={[styles.destinationTitle, { color: theme.colors.ink }]}>
              Where are you heading?
            </Text>

          </View>
          <View
            ref={searchFieldRef}
            style={[
              styles.searchField,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <RovaIcon name="search" color={theme.colors.brandStrong} size={22} />
            <TextInput
              accessibilityLabel="Search destinations in Ghana"
              editable={mapboxConfigured && selectingId === null}
              maxLength={256}
              onFocus={() => { setSearchFocused(true); revealSearchResults(); }}
              onBlur={() => setSearchFocused(false)}
              onChangeText={(text) => {
                setQuery(text);
                setSearchEnabled(true);
                setSelectedDestination(null);
                setRoute(null);
                setRouteError(null);
                setSuggestions([]);
                setSearchState("idle");
                setSearchMessage(null);
              }}
              placeholder={
                mapboxConfigured ? "Search places in Ghana" : "Add a Mapbox public token to search"
              }
              placeholderTextColor={theme.colors.inkSubtle}
              value={query}
              style={[styles.searchInput, { color: theme.colors.ink }]}
            />
          </View>

          {searchState === "loading" && (
            <Text style={[styles.statusText, { color: theme.colors.inkMuted }]}>
              Searching places…
            </Text>
          )}
          {searchMessage && (
            <Text accessibilityRole="alert" style={[styles.inlineNotice, { color: theme.colors.danger }]}>
              {searchMessage}
            </Text>
          )}
          {suggestions.length > 0 && (
            <ScrollView
              testID="destination-suggestions"
              onLayout={searchFocused ? revealSearchResults : undefined}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              nestedScrollEnabled
              style={styles.suggestionList}
            >
              {suggestions.map((suggestion) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${suggestion.name}`}
                  disabled={selectingId !== null}
                  key={suggestion.id}
                  onPress={() => handleSelectDestination(suggestion)}
                  style={[styles.suggestion, { borderTopColor: theme.colors.border }]}
                >
                  <Text style={[styles.suggestionName, { color: theme.colors.ink }]}>
                    {selectingId === suggestion.id ? "Loading destination…" : suggestion.name}
                  </Text>
                  <Text style={[styles.suggestionDetail, { color: theme.colors.inkMuted }]}>
                    {suggestion.detail}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {routeLoading && (
            <Text style={[styles.statusText, { color: theme.colors.inkMuted }]}>
              Calculating route…
            </Text>
          )}
          {routeError && (
            <Text accessibilityRole="alert" style={[styles.inlineNotice, { color: theme.colors.danger }]}>
              {routeError}
            </Text>
          )}
          {route && selectedDestination && (
            <View style={[styles.routeSummary, { borderTopColor: theme.colors.border }]}>
              <View style={styles.routeHeading}>
                <View style={styles.routeCopy}>
                  <Text style={[styles.routeTitle, { color: theme.colors.ink }]}>
                    {selectedDestination.name}
                  </Text>
                  <Text style={[styles.routeDetails, { color: theme.colors.inkMuted }]}>
                    {route.originLabel} · {travelDistance(selectedRoutingOption?.distanceMeters ?? distanceMeters,preferences.units)} · estimated{" "}
                    {Math.max(1, Math.round((selectedRoutingOption?.durationSeconds ?? durationSeconds) / 60))} min
                  </Text>
                </View>
                <Pill tone={trafficAware ? "warning" : "neutral"}>
                  {trafficAware ? "TRAFFIC DATA UNVERIFIED" : "NO LIVE TRAFFIC"}
                </Pill>
              </View>
              {selectedRoutingOption && <Text style={[styles.disclaimer, { color: theme.colors.inkSubtle }]}>{selectedRoutingOption.label} · Toll information {selectedRoutingOption.tolls === "unknown" ? "unknown" : selectedRoutingOption.tolls === "present" ? "reported" : "not reported"}. Guidance follows this selected route using GPS. Road validation is pending.</Text>}
              <ActionButton title="Compare route options" secondary onPress={() => router.push({ pathname: "/route-options", params: { origin: route.origin.join(","), destination: route.destination.join(","), title: route.destinationLabel } })} />
              <Text style={[styles.disclaimer, { color: theme.colors.inkSubtle }]}>
                {route.originIsLive
                  ? trafficAware
                    ? "Mapbox traffic mode is enabled, but traffic coverage in Ghana has not been verified."
                    : "Mapbox driving estimate; live traffic is not included."
                  : "Preview starts from Accra city center, not your GPS location. Locate yourself to refresh it."}
              </Text>
              <VehicleSelector value={vehicleType} onChange={setVehicleType} />
              <ActionButton
                title={route.originIsLive ? "Start navigation" : "Locate me to navigate"}
                disabled={!route.originIsLive}
                onPress={async () => {
                  router.push("/navigation");
                }}
              />
            </View>
          )}
          <ActionButton
            title={locationEnabled ? "Update route from my location" : "Use my location"}
            disabled={!mapboxConfigured}
            onPress={handleLocate}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Search destinations & recent searches" onPress={() => router.push("/destination-search")} style={styles.recentLink}><Text style={{ color: theme.colors.brandStrong, fontWeight: "700" }}>Recent searches & saved places  →</Text></Pressable>
        </Surface>



        {locationStatus && (
          <Text
            accessibilityRole="alert"
            style={[styles.inlineNotice, { color: theme.colors.warning }]}
          >
            {locationStatus}
          </Text>
        )}

        <View style={styles.limitHeader}>
          <Text style={[styles.sectionLabel, { color: theme.colors.inkMuted }]}>
            ROAD SAFETY
          </Text>
          <Text style={[styles.limitCaption, { color: theme.colors.inkSubtle }]}>
            Verified ROVA data only
          </Text>
        </View>
        <Surface style={styles.limitCard}>
          <View style={[styles.limitIcon, { backgroundColor: theme.colors.warningTint }]}>
            <Text style={[styles.limitIconText, { color: theme.colors.warning }]}>!</Text>
          </View>
          <View style={styles.limitCopy}>
            <Text style={[styles.limitTitle, { color: theme.colors.ink }]}>
              Speed limit unavailable
            </Text>
            <Text style={[styles.limitDescription, { color: theme.colors.inkMuted }]}>
              No approved ROVA speed-limit record is available here.
            </Text>
          </View>
          <Pill tone="warning">UNKNOWN</Pill>
        </Surface>


      </ContentFrame>
    </Page>
  );
}

const styles = StyleSheet.create({
  exploreHeader: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 24, marginBottom: 12 },
  headerButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, borderWidth: 1 },
  recentLink: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 18,
  },
  brand: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.7,
  },
  tagline: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
  },
  mapFrame: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
  },
  mapPlaceholder: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  mapNotice: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 90,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  mapNoticeTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  mapDescription: {
    maxWidth: 290,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  locateButton: {
    position: "absolute",
    right: 12,
    bottom: 12,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    gap: 7,
  },
  locateText: {
    fontSize: 13,
    fontWeight: "800",
  },
  inlineNotice: {
    marginTop: 9,
    fontSize: 12,
    lineHeight: 18,
  },
  limitHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 23,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  limitCaption: {
    fontSize: 11,
    fontWeight: "600",
  },
  limitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderRadius: 19,
  },
  limitIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  limitIconText: {
    fontSize: 22,
    fontWeight: "900",
  },
  limitCopy: {
    flex: 1,
  },
  limitTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  limitDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  destinationCard: {
    marginTop: 0,
    gap: 14,
    borderTopWidth: 0,
    padding: 20,
  },
  destinationHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  destinationTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "800",
  },
  searchField: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    minHeight: 54,
    paddingVertical: 10,
  },
  statusText: {
    fontSize: 12,
  },
  suggestion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 8,
  },
  suggestionList: {
    maxHeight: 240,
    flexGrow: 0,
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: "700",
  },
  suggestionDetail: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  routeSummary: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13,
    gap: 10,
  },
  routeHeading: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  routeCopy: {
    flex: 1,
    minWidth: 180,
  },
  routeTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  routeDetails: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "left",
  },
});
