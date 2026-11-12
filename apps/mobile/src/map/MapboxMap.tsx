import {tx} from "../i18n";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Mapbox, {
  Camera,
  LineLayer,
  ShapeSource,
  CircleLayer,
} from "@rnmapbox/maps";
import type { MapCoordinate, MapLineString } from "./types";
import { useRovaTheme } from "../theme/ThemeProvider";
import { NavigationLocationPuck, NavigationMarkerImages } from "./NavigationLocationPuck";

type MapboxMapProps = {
  fill?: boolean;
  center: MapCoordinate;
  routeGeometry?: MapLineString;
  destination?: MapCoordinate;
  locationEnabled: boolean;
  onMapLoaded: () => void;
  onMapError: (message: string) => void;
};

export function MapboxMap({
  fill = false,
  center,
  routeGeometry,
  destination,
  locationEnabled,
  onMapLoaded,
  onMapError,
}: MapboxMapProps) {
  const { theme } = useRovaTheme();
  const camera = useRef<Camera>(null);
  const currentZoom = useRef(12);
  function changeZoom(amount: number) {
    const next = Math.max(0, Math.min(22, currentZoom.current + amount));
    currentZoom.current = next;
    camera.current?.zoomTo(next, 200);
  }
  const routeShape = routeGeometry
    ? {
        type: "Feature" as const,
        properties: {},
        geometry: routeGeometry,
      }
    : undefined;

  return (
    <View style={[styles.container, fill && { flex: 1, height: "100%", borderRadius: 0 }]} accessibilityLabel="Interactive Mapbox map of Accra">
      <Mapbox.MapView
        style={StyleSheet.absoluteFill}
        requestDisallowInterceptTouchEvent
        zoomEnabled
        scrollEnabled
        gestureSettings={{ pinchZoomEnabled: true, doubleTapToZoomInEnabled: true }}
        onCameraChanged={(state) => { currentZoom.current = state.properties.zoom; }}
        styleURL={
          theme.mode === "dark" ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light
        }
        onDidFinishLoadingMap={onMapLoaded}
        onMapLoadingError={(payload) =>
          onMapError(
            payload?.error ??
              "Map tiles could not be loaded. Check the token, network, and token permissions.",
          )
        }
      >
        <Camera ref={camera} centerCoordinate={center} defaultSettings={{ zoomLevel: 12 }} />
        <NavigationMarkerImages />
        {routeShape && (
          <ShapeSource id="rova-route-preview" shape={routeShape}>
            <LineLayer
              id="rova-route-line"
              style={{
                lineColor: theme.colors.brandStrong,
                lineWidth: 6,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </ShapeSource>
        )}
        {locationEnabled && <NavigationLocationPuck />}
        {destination && <ShapeSource id="rova-destination" shape={{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: destination } }}>
          <CircleLayer id="rova-destination-pin" style={{ circleRadius: 10, circleColor: theme.colors.brandStrong, circleStrokeColor: "#ffffff", circleStrokeWidth: 3 }} />
        </ShapeSource>}
      </Mapbox.MapView>
      <View style={[styles.zoomControls, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        {([{ label: tx('map.zoomIn'), symbol: "+", amount: 1 }, { label: tx('map.zoomOut'), symbol: "−", amount: -1 }] as const).map((control) => (
          <Pressable key={control.label} accessibilityRole="button" accessibilityLabel={control.label} onPress={() => changeZoom(control.amount)} style={styles.zoomButton}>
            <Text style={[styles.zoomText, { color: theme.colors.brandStrong }]}>{control.symbol}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zoomControls: {
    position: "absolute",
    right: 12,
    top: 12,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  zoomButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  zoomText: { fontSize: 26, fontWeight: "700" },
  container: {
    height: 330,
    width: "100%",
    overflow: "hidden",
    borderRadius: 24,
  },
});
