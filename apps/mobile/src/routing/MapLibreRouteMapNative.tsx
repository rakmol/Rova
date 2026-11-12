import { Map, Camera, GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import type { RoutingOption } from "@rova/shared";
import { View } from "react-native";
export function MapLibreRouteMapNative({ route, onError }: { route: RoutingOption; onError: (message: string | null) => void }) {
  const points = route.geometry.coordinates;
  const west = Math.min(...points.map((p) => p[0])); const east = Math.max(...points.map((p) => p[0]));
  const south = Math.min(...points.map((p) => p[1])); const north = Math.max(...points.map((p) => p[1]));
  return <View style={{ height: 350, borderRadius: 18, overflow: "hidden" }}>
    <Map style={{ flex: 1 }} mapStyle="https://tiles.openfreemap.org/styles/liberty" onDidFinishLoadingMap={() => onError(null)} onDidFailLoadingMap={() => onError("Map tiles are unavailable. Route distance and instructions remain below.")} attribution>
      <Camera key={route.id} initialViewState={{ bounds: [[west - 0.001, south - 0.001], [east + 0.001, north + 0.001]], padding: { top: 32, bottom: 32, left: 24, right: 24 } }} />
      <GeoJSONSource id="selected-route" data={{ type: "Feature", properties: {}, geometry: route.geometry }}>
        <Layer id="route-casing" type="line" paint={{ "line-color": "#ffffff", "line-width": 9 }} layout={{ "line-cap": "round", "line-join": "round" }} />
        <Layer id="route-line" type="line" paint={{ "line-color": "#087f80", "line-width": 5 }} layout={{ "line-cap": "round", "line-join": "round" }} />
      </GeoJSONSource>
    </Map>
  </View>;
}
