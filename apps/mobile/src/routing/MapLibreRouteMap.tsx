import type { RoutingOption } from "@rova/shared";
import type { ComponentType } from "react";
import { TurboModuleRegistry, Text, View } from "react-native";
import { MapboxMap } from "../map/MapboxMap";
import { useRovaTheme } from "../theme/ThemeProvider";
type Props = { route: RoutingOption; onError: (message: string | null) => void };
// The installed older development client must remain usable until the new APK is installed.
const hasMapLibre = Boolean(TurboModuleRegistry.get("MLRNLogModule"));
let NativeRouteMap: ComponentType<Props> | undefined;
if (hasMapLibre) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NativeRouteMap = require("./MapLibreRouteMapNative").MapLibreRouteMapNative;
}
export function MapLibreRouteMap(props: Props) {
  const { theme } = useRovaTheme();
  if (NativeRouteMap) return <NativeRouteMap {...props} />;
  return <View>
    <Text style={{ color: theme.colors.inkMuted, marginBottom: 8 }}>MapLibre needs the updated ROVA development build. This installed build shows a Mapbox preview of the same selected route.</Text>
    <MapboxMap center={props.route.geometry.coordinates[0]} routeGeometry={props.route.geometry} destination={props.route.geometry.coordinates.at(-1)} locationEnabled={false} onMapLoaded={() => props.onError(null)} onMapError={props.onError} />
  </View>;
}
