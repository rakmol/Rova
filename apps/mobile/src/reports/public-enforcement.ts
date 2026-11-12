/** Public reporting snapshot. These factual names/values are not road geometry or approved rules. */
export const publicResearchDate = "2026-11-08";
export const enforcementSources = {
  trustcheck: { name: "TrustCheck", url: "https://trustcheckapp.com/blog/traffitech-gh-camera-locations-accra", publishedAt: "2026-11-01", updatedAt: "2026-11-08" },
  yen: { name: "YEN", url: "https://yen.com.gh/ghana/314868-traffitech-gh-speed-camera-locations-mapped-by-drivers-accra-kumasi/", publishedAt: "2026-11-02", updatedAt: null },
  police: { name: "Ghana Police Service", url: "https://police.gov.gh/en/index.php/traffitech-gh/" },
  deployments: { name: "YEN deployment report", url: "https://yen.com.gh/ghana/315081-traffitech-ghana-list-7-regions-confirmed-camera-deployments/", publishedAt: "2026-11-04" },
} as const;
export const reportedDeploymentCities = ["Accra", "Tema", "Kumasi", "Takoradi", "Sunyani", "Tamale", "Koforidua", "Ho"] as const;
export interface PublicEnforcementReport {
  id: string; area: string; city: "accra" | "kumasi"; source: "trustcheck" | "yen";
  verification: "unverified"; precision: "named_area_only"; geometry: null;
  reportedSpeedsKmh: number[]; reportedType: "unspecified" | "red_light";
}
type Entry = readonly [name: string, speeds?: readonly number[], type?: "red_light"];
// No geocoding of area names into purported camera coordinates. Values remain
// point-specific reports; different readings on the same road are retained.
const latest: readonly Entry[] = [
  ["Spintex Road", [50]], ["Tetteh Quarshie Interchange", [50]], ["Airport By Pass Road", [50]],
  ["Ring Road Central", [50]], ["Ring Road East", [50]], ["J.A. Kuffour Avenue", [50]], ["Kanda Highway / Kawukudi", [50]],
  ["Major Mahama Roundabout", [80]], ["Legon East Road", [80]], ["Harbour Road", [80]],
  ["Liberation Road", [80]], ["Olusegun Obasanjo Highway", [60]],
  ["Boundary Road / towards Mahama Road", [50]],
  ["J.J. Rawlings Avenue / North Legon / Madina / Frafraha"], ["Chief Alhaji Seidu Street", [50]],
  ["Haatso–Ecomog Avenue", [50]], ["Haatso–Atomic Road", [50]], ["Atomic Junction", [30]], ["Dome–St. John's Road", [50]],
  ["Ecowas Road / Madina"], ["Ashalebotwe Nmai Dzorn Road", [50]], ["Annie Jiagge Road", [30]], ["Alex Tetteh Avenue", [30]], ["Forest Road", [30, 50]],
  ["Lagos Avenue", [50]], ["Garden Street", [50]], ["Gulf Road", [50]], ["Pawpaw Street", [50]], ["Okine Avenue", [50]],
  ["Gye Nyame Street", [50]], ["Salem Avenue", [50]], ["Djani Ashie Road", [50]], ["Nii Aku Mensah Avenue", [50]],
  ["Osu Badu Avenue", [50]], ["Oxford Street", [50]], ["Aggrey Street", [50]], ["Giffard Road", [50]], ["Efua Sutherland Road", [50]],
  ["Brig. General R. Agbamasu Avenue", [50]], ["Fiesta Royale area", [50]], ["Mallam Junction"],
  ["Police Training Academy junction / Tesano", [50], "red_light"], ["Nsawam Road / Apenkwa overpass", [50], "red_light"],
  ["Nsawam Road / Achimota Old Station", [50]], ["Nsawam Road / Caprice", [50]],
  ["Winneba Road / Kokrobite Junction", [50]], ["Winneba Road / Mendskrom", [80]], ["Winneba Road / SCC", [40]],
  ["Winneba Road / Amanfrom"], ["Winneba Road / Bortianor"], ["Winneba Road / New Weija"], ["Accra–Cape Coast Road", [90]],
  ["Korando Street / Weija", [30]], ["Tangala Lane / Odorkor"], ["Adoley Addo Lane / Kwashieman"],
  ["Adafi Lane / Nii Boi Town"], ["Ngongo Lane / Nii Boi Town"], ["Nii Okaiman Avenue / Nii Boi Town / Nii Ankraman"],
  ["18th Street / Tantra Hill"], ["Manye Adorkor Avenue / Tantra Hill"], ["Red Okai Street / Tantra Hill"],
  ["Aburi Road / Teiman / Adenkrebi / Amanfrokoo / New Kweiman"], ["Kasoa", [40]], ["Borteyman New Road junction", [50]],
];
const earlierAccra: readonly Entry[] = [
  ["Jawaharlal Nehru Road / Liberation Link"],
  ["Cantonments Road"], ["Ring Road / Nima"], ["Teshie Link"], ["Laterbiokorshie"], ["N1 / Weija / Densu River"],
  ["Apenkwa / Abeka / Achimota / Abelenkpe"], ["Taifa / Ofankor / Sowutuom"], ["Pillar 2", [30, 50]],
  ["Haatso / Papao / Madina", [50]], ["Dzorwulu / North Dzorwulu"], ["East Legon / Shiashie / Bawaleshie / towards Madina", [30]], ["Ogbojo / Adjiringanor"],
];
const earlierKumasi: readonly Entry[] = [
  ["N6 / Bomso / Ayigya / Kentinkrono / Nsenie / Anwiankwanta"], ["Asokwa"], ["Adukrom / Asokore Mampong"], ["Ayeduase / KNUST"],
];
function reports(entries: readonly Entry[], city: PublicEnforcementReport["city"], source: PublicEnforcementReport["source"]): PublicEnforcementReport[] {
  return entries.map(([area, speeds = [], type], i) => ({ id: `${source}-${city}-${i}`, area, city, source, verification: "unverified", precision: "named_area_only", geometry: null, reportedSpeedsKmh: [...speeds], reportedType: type ?? "unspecified" }));
}
export const publicEnforcementReports = [...reports(latest, "accra", "trustcheck"), ...reports(earlierAccra, "accra", "yen"), ...reports(earlierKumasi, "kumasi", "yen")];
export function filterPublicReports(query: string, city: "all" | PublicEnforcementReport["city"]) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return publicEnforcementReports.filter((r) => (city === "all" || r.city === city) && terms.every((term) => `${r.area} ${r.reportedSpeedsKmh.join(" ")}`.toLocaleLowerCase().includes(term)));
}
/** Public FAQ guidance only. Never a GPS match, fallback rule, or national 80 km/h setting. */
export const policeSpeedGuidance = [
  { kmh: 30, context: "Schools, markets and places with concentrated human activity" },
  { kmh: 50, context: "Urban and built-up roads" },
  { kmh: 90, context: "Highways" },
  { kmh: 100, context: "Motorways" },
] as const;
