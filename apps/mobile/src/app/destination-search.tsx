import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ActionButton, ContentFrame, Page, Surface } from "../components/ui";
import { ScreenTopBar } from '../components/ScreenTopBar';
import { RovaIcon } from "../components/RovaIcon";
import { MapboxMap } from "../map/MapboxMap";
import { mapboxProvider, accraDevelopmentCenter } from "../map/mapboxProvider";
import { useRoutePreview } from "../map/RouteProvider";
import { placesProvider, landmarkSearchEnabled } from "../places/runtime";
import type { Place } from "../places/provider";
import { writeHistory, useHistory, historyStorageStatus } from "../places/history";
import { useRovaTheme } from "../theme/ThemeProvider";
import { SavePlaceActions } from '../account/SavePlaceActions';

export default function DestinationSearchScreen() {
  const { theme } = useRovaTheme();
  const { setPickedDestination } = useRoutePreview();
  const [query, setQuery] = useState("");
  const history=useHistory();
  const [storageError, setStorageError] = useState<string | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    mapboxProvider.initialize().then(() => { if (active) setMapReady(true); }).catch(() => { if (active) setMapError("Map preview is unavailable. You can still select a search result."); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    if (query.trim().length < 2 || selected) return;
    const timer = setTimeout(() => {
      setStatus("loading");
      setError(null);
      placesProvider.autocomplete(query, accraDevelopmentCenter, controller.signal).then((places) => {
        if (!controller.signal.aborted && generation.current === id) { setResults(places); setStatus("done"); }
      }).catch((caught: unknown) => {
        if (!controller.signal.aborted && generation.current === id) { setError(caught instanceof Error ? caught.message : "Search failed. Try again."); setStatus("error"); }
      });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, selected, retry]);

  function updateHistory(next: typeof history) {
    
    setStorageError(null);
    void writeHistory(next).catch(() => setStorageError("Could not save your history preference on this device. Try again."));
  }
  function edit(text: string) { setQuery(text); setSelected(null); setResults([]); setStatus("idle"); setError(null); }
  async function select(place: Place) {
    Keyboard.dismiss();
    try {
      const details = await placesProvider.details(place);
      setSelected(details);
      setResults([]);
      if (history.enabled) {
        const typed = query.trim();
        updateHistory({ enabled: true, queries: [typed, ...history.queries.filter((item) => item.toLowerCase() !== typed.toLowerCase())].slice(0, 10) });
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open that place."); }
  }
  const ink = { color: theme.colors.ink };
  const muted = { color: theme.colors.inkMuted };
  return <Page><ContentFrame>
    <ScreenTopBar title="Search destinations" backLabel="Back to map" onBack={() => router.back()} />
    <View style={[styles.searchField,{borderColor:theme.colors.border,backgroundColor:theme.colors.surface}]}>
      <RovaIcon name="search" color={theme.colors.brandStrong} size={22}/>
      <TextInput accessibilityLabel="Search Ghana places" autoFocus autoCorrect={false} maxLength={256} value={query} onChangeText={edit} placeholder={landmarkSearchEnabled ? "Street, landmark, market or suburb" : "Street, suburb or place name"} placeholderTextColor={theme.colors.inkSubtle} style={[styles.input, ink]} />
    </View>
    {status === "loading" && <Text accessibilityLiveRegion="polite" style={[styles.message, muted]}>Searching Ghana places…</Text>}
    {error && <View><Text accessibilityRole="alert" style={[styles.message, { color: theme.colors.danger }]}>{error}</Text><ActionButton title="Try search again" secondary onPress={() => setRetry((value) => value + 1)} /></View>}
    {status === "done" && !results.length && !selected && <Text style={[styles.message, muted]}>No matches found. Try a nearby street or suburb, or check the spelling. This provider may not list that landmark.</Text>}
    {!!results.length&&<Surface style={styles.results}>
      {results.map((place) => <Pressable accessibilityRole="button" accessibilityLabel={`View ${place.name}`} key={place.id} onPress={() => void select(place)} style={[styles.result, { borderBottomColor: theme.colors.border }]}>
        <View style={[styles.resultIcon,{backgroundColor:theme.colors.brandTint}]}><RovaIcon name="locate" color={theme.colors.brandStrong} size={20}/></View>
        <View style={styles.resultCopy}><Text style={[styles.name, ink]}>{place.name}</Text><Text style={muted}>{place.detail}</Text></View>
        <RovaIcon name="chevron" color={theme.colors.inkSubtle} size={18}/>
      </Pressable>)}
    </Surface>}
    {selected && <Surface style={styles.details}>
      <Text style={[styles.name, ink]}>{selected.name}</Text><Text style={muted}>{selected.detail}</Text>
      <Text style={muted}>Latitude {selected.coordinate[1].toFixed(5)} · Longitude {selected.coordinate[0].toFixed(5)}</Text>
      {mapReady && <MapboxMap center={selected.coordinate} destination={selected.coordinate} locationEnabled={false} onMapLoaded={() => setMapError(null)} onMapError={setMapError} />}
      {mapError && <Text accessibilityRole="alert" style={muted}>{mapError}</Text>}
      <Text style={muted}>{selected.attribution} · Location from the search provider; please check the pin.</Text>
      <ActionButton title="Use this destination" onPress={() => { setPickedDestination(selected); router.navigate("/(tabs)/map"); }} />
      <SavePlaceActions place={selected}/>
    </Surface>}
    <Surface style={styles.details}>
      <View style={styles.row}><Text style={[styles.name, ink]}>Remember recent searches</Text><Switch accessibilityLabel="Remember recent searches" value={history.enabled} onValueChange={(enabled) => updateHistory({ enabled, queries: [] })} /></View>
      <Text style={muted}>Off by default. Only your typed queries are saved on this device, up to 10. Turning this off clears them.</Text>
      {(storageError||historyStorageStatus().error) && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{storageError||historyStorageStatus().error}</Text>}
      {history.enabled && <><ActionButton title="Clear recent searches" secondary onPress={() => updateHistory({ enabled: true, queries: [] })} />{!history.queries.length && <Text style={muted}>No recent searches yet.</Text>}{history.queries.map((text) => <Pressable key={text} accessibilityRole="button" accessibilityLabel={`Search again for ${text}`} onPress={() => edit(text)} style={styles.result}><Text style={ink}>{text}</Text></Pressable>)}</>}
    </Surface>
    <Pressable accessibilityRole="button" accessibilityLabel="Search coverage & costs" accessibilityState={{expanded:coverageOpen}} onPress={()=>setCoverageOpen(!coverageOpen)} style={styles.result}><RovaIcon name="about" color={theme.colors.inkMuted}/><Text style={[muted,{flex:1}]}>Search coverage & costs</Text><RovaIcon name="chevron" color={theme.colors.inkMuted}/></Pressable>
    {coverageOpen&&<Surface style={styles.details}><Text style={[styles.name, ink]}>Search coverage & costs</Text>
      {landmarkSearchEnabled ? <>
        <Text style={muted}>Geoapify searches streets, addresses, suburbs and named amenities in Ghana, biased toward Accra. Mapped markets, hospitals, malls and landmarks can appear; missing or informal names may return no match. No matches are invented.</Text>
        <Text style={muted}>Search text and the Accra bias go through ROVA’s backend to Geoapify. The key stays on the server. Maps and navigation continue to use Mapbox.</Text>
        <Text style={muted}>Free plan checked 7 Nov 2026: 3,000 credits/day, no credit card required, up to 5 requests/second. One autocomplete request uses one credit. Paid plans are optional; the first monthly tier is $59. Usage across the account shares the quota.</Text>
        <Text style={muted}>200 ms debounce, 6 results, 30 searches/minute per device and per IP. Licensed results are cached for 5 minutes, up to 40 queries. The backend defaults to 1,000 new upstream requests/day per process. Account quotas still apply.</Text>
        <ActionButton title="Powered by Geoapify" secondary onPress={() => { void Linking.openURL("https://www.geoapify.com/").catch(() => setError("Visit geoapify.com for provider information.")); }} />
        <ActionButton title="© OpenStreetMap contributors" secondary onPress={() => { void Linking.openURL("https://www.openstreetmap.org/copyright").catch(() => setError("Visit openstreetmap.org/copyright for attribution.")); }} />
        <ActionButton title="View Geoapify pricing" secondary onPress={() => { void Linking.openURL("https://www.geoapify.com/pricing/").catch(() => setError("Visit geoapify.com/pricing for current prices.")); }} />
      </> : <>
      <Text style={muted}>© Mapbox Geocoding. Ghana-filtered, biased toward Accra. Street, suburb and address coverage varies. Business, market, landmark and junction names may be missing; no results are invented. Opening hours, reviews and phone numbers are not supplied.</Text>
      <Text style={muted}>Search text and the Accra search bias go to Mapbox. Each autocomplete request can count toward usage and charges; map views and navigation are billed separately. Up to 6 results, 200 ms debounce and 30 searches/minute per device.</Text>
      <Text style={muted}>Published temporary-geocoding pricing checked 7 Nov 2026: first 100,000 requests/month free, then $0.75 per 1,000 in the next tier. Account usage, permanent storage and contract terms can change the cost. Check current pricing before enabling paid usage.</Text>
      <Text style={muted}>Result caching is off for temporary geocoding. Licensed permanent mode enables a 5-minute cache of up to 40 queries. Recent history contains only text you typed.</Text>
      <ActionButton title="View Mapbox pricing" secondary onPress={() => { void Linking.openURL("https://www.mapbox.com/pricing").catch(() => setError("Could not open pricing. Visit mapbox.com/pricing.")); }} />
      </>}
    </Surface>}
  </ContentFrame></Page>;
}
const styles = StyleSheet.create({
  searchField:{minHeight:58,borderWidth:1,borderRadius:17,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10},
  input: { flex:1,minHeight:54,paddingVertical:10,fontSize:16 },
  message: { marginVertical: 14, lineHeight: 21 },
  results:{paddingVertical:4,paddingHorizontal:12,gap:0},
  result: { minHeight:70,paddingVertical:12,borderBottomWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'center',gap:12 },
  resultIcon:{width:38,height:38,borderRadius:13,alignItems:'center',justifyContent:'center'},
  resultCopy:{flex:1,minWidth:0,gap:4},
  name: { fontSize: 16, fontWeight: "700" },
  details: { marginTop: 18, gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" },
});
