import { useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { ActionButton, Pill, Surface } from "../components/ui";
import { useRovaTheme } from "../theme/ThemeProvider";
import { enforcementSources, filterPublicReports, policeSpeedGuidance, publicEnforcementReports, publicResearchDate, reportedDeploymentCities } from "./public-enforcement";
import promptCoverage from './road-alert-coverage.json';
const mappedRoadNames:Record<string,string>=promptCoverage.reportRoadNames;
export function PublicEnforcementReports() {
  const { theme } = useRovaTheme();
  const [query, setQuery] = useState(""); const [city, setCity] = useState<"all" | "accra" | "kumasi">("all");
  const [count, setCount] = useState(10); const [linkError, setLinkError] = useState(false);
  const results = filterPublicReports(query, city);
  const ink = { color: theme.colors.ink }; const note = { color: theme.colors.inkMuted, fontSize: 12, lineHeight: 18 };
  const open = (url: string) => { setLinkError(false); void Linking.openURL(url).catch(() => setLinkError(true)); };
  return <View style={{ gap: 12, marginBottom: 24 }}>
    <Surface style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[ink, { fontSize: 20, fontWeight: "800" }]}>Reported enforcement areas</Text>
      <Pill tone="warning">PUBLIC REPORTS · UNVERIFIED</Pill>
      <Text style={note}>Checked {publicResearchDate}. {publicEnforcementReports.length} named areas from published reports. This is a dated research snapshot, not a live camera feed or a complete camera list.</Text>
      <Text style={note}>Read before driving. Reported speeds apply to individual sightings, not necessarily the whole named road. Some equipment moves. Follow current signs everywhere; an unlisted area does not mean no enforcement.</Text>
      <Text style={note}>During navigation, mapped reported roads can give an unverified road-level prompt. Some areas still lack usable geometry. These prompts do not confirm a camera position or the applicable speed limit.</Text>
    </Surface>
    <Surface style={{ gap: 8 }}>
      <Text style={[ink, { fontWeight: "800" }]}>Broader city-level reporting</Text>
      <Text style={note}>{reportedDeploymentCities.join(", ")}. The {enforcementSources.deployments.publishedAt} news report attributes deployments to MTTD. It does not establish exact operating sites or coverage.</Text>
      <ActionButton secondary title="Read city deployment report" onPress={() => open(enforcementSources.deployments.url)} />
    </Surface>
    <Surface style={{ gap: 8 }}>
      <Text style={[ink, { fontWeight: "800" }]}>Is the limit always 80 km/h?</Text>
      <Text style={note}>No. The sources do not establish one nationwide 80 km/h limit. Some individual reports record 80; others record lower or higher values. These reports cannot verify your current legal limit.</Text>
      <Text style={note}>Ghana Police FAQ guide, checked {publicResearchDate}:</Text>
      {policeSpeedGuidance.map((g) => <Text key={g.kmh} style={note}>{g.kmh} km/h · {g.context}</Text>)}
      <Text style={note}>This is general information. Posted and vehicle-specific restrictions can differ. Navigation uses a verified road match before showing an applicable limit.</Text>
      <ActionButton secondary title="Read Ghana Police guidance" onPress={() => open(enforcementSources.police.url)} />
    </Surface>
    <TextInput accessibilityLabel="Search reported enforcement areas" placeholder="Search road, suburb or reported speed" placeholderTextColor={theme.colors.inkSubtle} value={query} onChangeText={(text) => { setQuery(text); setCount(10); }} style={{ color: theme.colors.ink, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56, fontSize: 16, backgroundColor: theme.colors.surface }} autoCorrect={false} />
    <View accessibilityRole="radiogroup" accessibilityLabel="Reported area region" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {([['all','All'],['accra','Accra area'],['kumasi','Kumasi']] as const).map(([value,label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: city === value }} onPress={() => { setCity(value); setCount(10); }} style={{ flex: 1, minWidth: 92, minHeight: 48, paddingHorizontal: 10, justifyContent: "center", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: city === value ? theme.colors.brandTint : theme.colors.surface }}><Text style={ink}>{label}</Text></Pressable>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={note}>{results.length} matching named areas · {Math.min(count, results.length)} shown</Text>
    {results.length === 0 && <Text style={note}>No matching published report in this snapshot. Enforcement may still operate here.</Text>}
    {results.slice(0, count).map((report) => <Surface key={report.id} style={{ gap: 6, padding: 14 }}>
      <Text style={[ink, { fontWeight: "800" }]}>{report.area}</Text>
      <Text style={note}>{report.reportedSpeedsKmh.length ? `Reported: ${report.reportedSpeedsKmh.join(" / ")} km/h · unverified` : "Speed limit not reported · unverified"}</Text>
      <Text style={note}>{mappedRoadNames[report.id]?`Road-level prompt mapped: ${mappedRoadNames[report.id]} · unverified`:'Proximity prompt unavailable: no matched road shape yet.'}</Text>
      {report.reportedType === "red_light" && <Text style={note}>Reported camera type: red light · unverified</Text>}
      <Text style={note}>{enforcementSources[report.source].name} · published {enforcementSources[report.source].publishedAt}{enforcementSources[report.source].updatedAt ? ` · source updated ${enforcementSources[report.source].updatedAt}` : ""}</Text>
      <Pressable accessibilityRole="link" accessibilityLabel={`Source for ${report.area}`} onPress={() => open(enforcementSources[report.source].url)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: theme.colors.brandStrong }}>Read source</Text></Pressable>
    </Surface>)}
    {count < results.length && <ActionButton title="Show 10 more areas" secondary onPress={() => setCount((n) => n + 10)} />}
    <Text style={note}>The 8 November TrustCheck update adds newer reports to earlier reporting also described by YEN. These sources share underlying driver reports; their agreement is not independent verification. Named areas are not camera counts or precise positions.</Text>
    <ActionButton secondary title="Read the latest TrustCheck article" onPress={() => open(enforcementSources.trustcheck.url)} />
    {linkError && <Text accessibilityRole="alert" style={note}>The source could not open. Check your internet connection and try again.</Text>}
  </View>;
}
