import { VehicleSelector } from "../components/VehicleSelector";
import {saveOfflineRoute} from "../offline/data";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { RoutingCoordinate, RoutingResponse } from "@rova/shared";
import { ActionButton, ContentFrame, Page, PageHeader, Surface } from "../components/ui";
import { useRoutePreview } from "../map/RouteProvider";
import { MapLibreRouteMap } from "../routing/MapLibreRouteMap";
import { routingProvider } from "../routing/runtime";
import { useRovaTheme } from "../theme/ThemeProvider";
import { travelDistance, useDriverData } from '../account/local';

function parseCoordinate(value: unknown): RoutingCoordinate {
  if (typeof value !== "string") throw new Error("Choose an origin and destination on the map first.");
  const parts = value.split(",").map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) throw new Error("Invalid route coordinates.");
  return [parts[0], parts[1]];
}
const minutes = (seconds: number) => seconds < 60 ? "<1 min" : `${Math.round(seconds / 60)} min`;

export default function RouteOptionsScreen() {
  const params = useLocalSearchParams<{ origin?: string; destination?: string; title?: string }>();
  const { route, setSelectedRoutingOption, vehicleType, setVehicleType } = useRoutePreview();
  const { theme } = useRovaTheme();
  const {preferences}=useDriverData();
  const origin = params.origin ?? route?.origin.join(",");
  const destination = params.destination ?? route?.destination.join(",");
  const [data, setData] = useState<RoutingResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [downloadMessage,setDownloadMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [allInstructions, setAllInstructions] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => routingProvider.routes(parseCoordinate(origin), parseCoordinate(destination), controller.signal)).then((result) => {
      if (controller.signal.aborted) return;
      setData(result); setSelectedId(result.routes[0]?.id ?? ""); setLoading(false);
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Routes could not be loaded."); setLoading(false);
    });
    return () => controller.abort();
  }, [origin, destination, retry]);
  const selected = data?.routes.find((option) => option.id === selectedId);
  const ink = { color: theme.colors.ink }; const muted = { color: theme.colors.inkMuted };
  return <Page><ContentFrame>
    <ActionButton title="Back to map" secondary onPress={() => router.back()} />
    <PageHeader eyebrow="Route options" title={params.title || route?.destinationLabel || "Compare routes"} subtitle="Driving estimates without live traffic. Check road conditions and restrictions before travel." />
    <Surface style={{ marginBottom: 16 }}><VehicleSelector value={vehicleType} onChange={setVehicleType} /></Surface>
    {loading && <Text accessibilityLiveRegion="polite" style={muted}>Calculating supported routes. This may take a few seconds on a slow connection...</Text>}
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>}
    {!loading && !error && data?.routes.length === 0 && <Text style={muted}>No driving route was found. Check the origin and destination, then try again. No sample route has been substituted.</Text>}
    {!loading && <ActionButton title="Retry route search" secondary onPress={() => { setLoading(true); setError(null); setData(null); setRetry((value) => value + 1); }} />}
    {data?.warnings.map((warning, i) => <Text key={i} accessibilityRole="alert" style={muted}>{warning}</Text>)}
    {data && data.routes.length === 1 && <Text style={muted}>Only one distinct route was returned. Other supported preferences did not produce a different available route.</Text>}
    <View accessibilityRole="radiogroup" accessibilityLabel="Available routes" style={{ gap: 10, marginVertical: 16 }}>
      {data?.routes.map((option) => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selectedId === option.id }} accessibilityLabel={option.label} onPress={() => { setSelectedId(option.id); setAllInstructions(false); setMapError(null); }} style={{ padding: 16, borderRadius: 16, borderWidth: 2, borderColor: selectedId === option.id ? theme.colors.brandStrong : theme.colors.border, backgroundColor: theme.colors.surface }}>
        <Text style={[ink, { fontWeight: "800", fontSize: 16 }]}>{option.isSample ? "SAMPLE ROUTE - " : ""}{option.label}</Text>
        <Text style={ink}>{travelDistance(option.distanceMeters,preferences.units)} | Estimated {minutes(option.durationSeconds)}</Text>
        <Text style={muted}>No live traffic | {option.tolls === "present" ? "Tolls reported" : option.tolls === "none_reported" ? "No tolls reported by provider" : "Toll information unknown"}</Text>
      </Pressable>)}
    </View>
    {selected && <Surface style={{ gap: 12 }}>
      {selected.isSample && <Text accessibilityRole="alert" style={{ color: theme.colors.warning }}>Sample route for testing only. Not for navigation.</Text>}
      <MapLibreRouteMap route={selected} onError={setMapError} />
      {mapError && <Text accessibilityRole="alert" style={muted}>{mapError}</Text>}
      <Text style={muted}>{selected.attribution}</Text>
      <Text accessibilityRole="link" onPress={() => { void Linking.openURL("https://www.geoapify.com/"); }} style={{ color: theme.colors.brandStrong }}>Powered by Geoapify</Text>
      <Text accessibilityRole="link" onPress={() => { void Linking.openURL("https://www.openstreetmap.org/copyright"); }} style={{ color: theme.colors.brandStrong }}>OpenStreetMap contributors</Text>
      <Text style={ink}>Estimated distance {travelDistance(selected.distanceMeters,preferences.units)} | Estimated time {minutes(selected.durationSeconds)}</Text>
      <Text style={muted}>Traffic coverage is not verified for Ghana. These times are static route estimates.</Text>
      <ActionButton title="Save route for offline guidance" secondary disabled={saving||selected.isSample} onPress={()=>{if(saving)return;setSaving(true);void saveOfflineRoute(parseCoordinate(origin),parseCoordinate(destination),params.title||route?.destinationLabel||"Saved route",selected).then(()=>setDownloadMessage("Route saved, encrypted on this phone. Valid for 24 hours. Start near the saved path; rerouting needs internet.")).catch(e=>setDownloadMessage(e instanceof Error?e.message:"Could not save route.")).finally(()=>setSaving(false));}}/>
      {!!downloadMessage&&<Text accessibilityLiveRegion="polite" style={muted}>{downloadMessage}</Text>}
      <ActionButton title="Use route preview" disabled={selected.isSample} onPress={() => { setSelectedRoutingOption(selected); router.back(); }} />
      <Text style={muted}>Guidance follows this selected route using GPS and device speech. Experimental: real-road validation is pending.</Text>
      <Text style={[ink, { fontSize: 17, fontWeight: "700" }]}>Maneuver instructions</Text>
      {!selected.maneuvers.length && <Text style={muted}>Maneuver instructions were not supplied for this route.</Text>}
      {selected.maneuvers.slice(0, allInstructions ? undefined : 12).map((step, i) => <Text key={i} style={ink}>{i + 1}. {step.instruction}{step.distanceMeters === null ? "" : ` (${travelDistance(step.distanceMeters,preferences.units)})`}</Text>)}
      {selected.maneuvers.length > 12 && <ActionButton title={allInstructions ? "Show fewer instructions" : "Show all instructions"} secondary onPress={() => setAllInstructions((value) => !value)} />}
    </Surface>}
    <Text style={[muted, { marginVertical: 16 }]}>Powered by Geoapify. Up to three routing requests per uncached comparison, with a two-minute cache. Longer routes can cost extra credits. Your provider account limits apply; maps and voice navigation have separate terms.</Text>
    <ActionButton title="Geoapify pricing & attribution" secondary onPress={() => { void Linking.openURL("https://www.geoapify.com/pricing/").catch(() => setError("Visit geoapify.com/pricing for current prices.")); }} />
    <Text style={muted}>MapLibre preview map: OpenFreeMap, OpenMapTiles and OpenStreetMap contributors.</Text>
  </ContentFrame></Page>;
}
