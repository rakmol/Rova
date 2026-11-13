import {tx} from "../i18n";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Mapbox, {
  Camera,
  LineLayer,
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  CameraGestureObserver,
} from "@rnmapbox/maps";
import type { MapCoordinate, MapLineString } from "./types";
import { useRovaTheme } from "../theme/ThemeProvider";
import { NavigationLocationPuck, NavigationMarkerImages } from "./NavigationLocationPuck";
import type { Fix } from '../navigation/session';
import { splitRouteAtProgress } from './routeProgress';

type MapboxMapProps = {
  fill?: boolean;
  center: MapCoordinate;
  routeGeometry?: MapLineString;
  destination?: MapCoordinate;
  locationEnabled: boolean;
  navigationFix?: Fix;
  navigationMode?: boolean;
  navigationBearing?: number | null;
  routeProgressMeters?: number;
  mapBottomInset?: number;
  controlsTopInset?: number;
  onPickCoordinate?: (coordinate: MapCoordinate) => void;
  onMapLoaded: () => void;
  onMapError: (message: string) => void;
};

export function MapboxMap({
  fill = false,
  center,
  routeGeometry,
  destination,
  locationEnabled,
  navigationFix,
  navigationMode = false,
  navigationBearing,
  routeProgressMeters = 0,
  mapBottomInset = 0,
  controlsTopInset = 12,
  onPickCoordinate,
  onMapLoaded,
  onMapError,
}: MapboxMapProps) {
  const { theme } = useRovaTheme();
  const camera = useRef<Camera>(null);
  const currentZoom = useRef(navigationMode ? 16 : 12);
  const [following, setFollowing] = useState(true);
  const bearing = navigationBearing === undefined ? navigationFix?.heading ?? null : navigationBearing;
  function recenter() {
    if (!locationEnabled || !navigationFix) return;
    setFollowing(true);
    currentZoom.current = 16;
    camera.current?.setCamera({ centerCoordinate: navigationFix.coordinate, heading: bearing ?? 0, zoomLevel: 16, animationDuration: 450, animationMode: 'easeTo' });
  }
  function changeZoom(amount: number) {
    const next = Math.max(0, Math.min(22, currentZoom.current + amount));
    currentZoom.current = next;
    camera.current?.zoomTo(next, 200);
  }
  const routeParts = useMemo(() => routeGeometry
    ? splitRouteAtProgress(routeGeometry, navigationMode ? routeProgressMeters : 0)
    : undefined, [routeGeometry, navigationMode, routeProgressMeters]);
  const completedShape = routeParts?.completed
    ? { type: 'Feature' as const, properties: {}, geometry: routeParts.completed }
    : undefined;
  const routeShape = routeParts?.remaining
    ? {
        type: "Feature" as const,
        properties: {},
        geometry: routeParts.remaining,
      }
    : undefined;

  return (
    <View style={[styles.container, fill && { flex: 1, height: "100%", borderRadius: 0 }]} accessibilityLabel="Interactive Mapbox map of Accra">
      <Mapbox.MapView
        style={StyleSheet.absoluteFill}
        requestDisallowInterceptTouchEvent
        zoomEnabled
        scrollEnabled
        logoPosition={{left:8,bottom:mapBottomInset+8}}
        attributionPosition={{left:100,bottom:mapBottomInset+8}}
        onPress={event => { const geometry=event.geometry; if(onPickCoordinate&&geometry.type==='Point') onPickCoordinate(geometry.coordinates as MapCoordinate); }}
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
        <Camera ref={camera} padding={mapBottomInset>0?{paddingTop:controlsTopInset,paddingBottom:mapBottomInset+16,paddingLeft:16,paddingRight:16}:undefined} centerCoordinate={!navigationMode || following ? center : undefined} heading={navigationMode && following ? bearing ?? undefined : undefined} animationDuration={navigationMode ? 300 : undefined} animationMode={navigationMode ? 'linearTo' : undefined} defaultSettings={{ zoomLevel: navigationMode ? 16 : 12 }} />
        {navigationMode && <CameraGestureObserver onCameraChanged={event => { if (event.nativeEvent.properties.isUserInteraction) setFollowing(false); }} />}
        <NavigationMarkerImages />
        {completedShape && <ShapeSource id="rova-route-completed" shape={completedShape}>
          <LineLayer id="rova-route-completed-line" style={{ lineColor: theme.mode === 'dark' ? '#A1ABB2' : '#89949A', lineWidth: 6, lineCap: 'round', lineJoin: 'round' }} />
        </ShapeSource>}
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
        {locationEnabled && navigationFix && <ShapeSource id="rova-navigation-position" shape={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: navigationFix.coordinate } }}>
          <SymbolLayer id="rova-navigation-arrow" style={{ iconImage: bearing === null ? 'rova-navigation-unknown' : 'rova-navigation-moving', iconRotate: bearing ?? 0, iconRotationAlignment: 'map', iconPitchAlignment: 'map', iconSize: 1, iconAllowOverlap: true, iconIgnorePlacement: true }} />
        </ShapeSource>}
        {locationEnabled && !navigationFix && <NavigationLocationPuck />}
        {destination && <ShapeSource id="rova-destination" shape={{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: destination } }}>
          <CircleLayer id="rova-destination-pin" style={{ circleRadius: 10, circleColor: theme.colors.brandStrong, circleStrokeColor: "#ffffff", circleStrokeWidth: 3 }} />
        </ShapeSource>}
      </Mapbox.MapView>
      <View style={[styles.zoomControls, { top: controlsTopInset, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        {([{ label: tx('map.zoomIn'), symbol: "+", amount: 1 }, { label: tx('map.zoomOut'), symbol: "−", amount: -1 }] as const).map((control) => (
          <Pressable key={control.label} accessibilityRole="button" accessibilityLabel={control.label} onPress={() => changeZoom(control.amount)} style={styles.zoomButton}>
            <Text style={[styles.zoomText, { color: theme.colors.brandStrong }]}>{control.symbol}</Text>
          </Pressable>
        ))}
      </View>
      {navigationMode && <Pressable accessibilityRole="button" accessibilityLabel="Recenter on your position and follow travel direction" accessibilityState={{ disabled: !locationEnabled || !navigationFix, selected: following }} disabled={!locationEnabled || !navigationFix} onPress={recenter} style={[styles.recenter, { bottom:mapBottomInset+34, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: locationEnabled && navigationFix ? 1 : 0.55 }]}>
        <Text style={{ color: theme.colors.brandStrong, fontSize: 14, fontWeight: '800' }}>Recenter</Text>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  recenter: { position: 'absolute', right: 12, bottom: 34, minHeight: 48, minWidth: 96, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderWidth: 1, borderRadius: 16 },
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
