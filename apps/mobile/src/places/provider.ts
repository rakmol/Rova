export type Coordinate = [number, number];
export interface Place {
  id: string;
  name: string;
  detail: string;
  coordinate: Coordinate;
  attribution: string;
  storageProof?: string;
}
export interface PlacesProvider {
  autocomplete(query: string, proximity: Coordinate, signal?: AbortSignal): Promise<Place[]>;
  details(place: Place): Promise<Place>;
  clearCache(): void;
}
export type PlacesOptions = {
  provider?: "mapbox" | "geoapify";
  accessToken?: string;
  proxyUrl?: string;
  permanentStorage?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const proof=(p:Record<string,unknown>,trusted:boolean)=>trusted&&typeof p.rova_storage_proof==='string'&&p.rova_storage_proof.length<=1024?{storageProof:p.rova_storage_proof}:{};
export function parsePlaces(payload: unknown, trustedStorage=false): Place[] {
  if (!record(payload) || !Array.isArray(payload.features)) throw new Error("Search returned an invalid response. Try again.");
  const seen = new Set<string>();
  return payload.features.flatMap((feature): Place[] => {
    if (!record(feature) || !record(feature.properties) || !record(feature.geometry)) return [];
    const p = feature.properties;
    const coordinates = feature.geometry.coordinates;
    const country = record(p.context) && record(p.context.country) ? p.context.country.country_code : null;
    if (country !== "GH" || typeof p.mapbox_id !== "string" || typeof p.name !== "string" || !p.name.trim()
      || !Array.isArray(coordinates) || coordinates.length !== 2
      || !coordinates.every((v) => typeof v === "number" && Number.isFinite(v))
      || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90 || seen.has(p.mapbox_id)) return [];
    seen.add(p.mapbox_id);
    return [{ id: p.mapbox_id, name: p.name, detail: typeof p.full_address === "string" ? p.full_address : typeof p.place_formatted === "string" ? p.place_formatted : "Ghana",
      coordinate: [coordinates[0], coordinates[1]], attribution: "© Mapbox", ...proof(p,trustedStorage) }];
  }).slice(0, 6);
}

export function parseGeoapifyPlaces(payload: unknown, trustedStorage=false): Place[] {
  if (!record(payload) || !Array.isArray(payload.features)) throw new Error("Search returned an invalid response. Try again.");
  const seen = new Set<string>();
  return payload.features.flatMap((feature): Place[] => {
    if (!record(feature) || !record(feature.properties) || !record(feature.geometry)) return [];
    const p = feature.properties;
    const coordinate = feature.geometry.coordinates;
    const name = typeof p.name === "string" && p.name.trim() ? p.name : p.address_line1;
    if (String(p.country_code).toLowerCase() !== "gh" || typeof p.place_id !== "string" || !p.place_id
      || typeof name !== "string" || !name.trim() || seen.has(p.place_id)
      || !Array.isArray(coordinate) || coordinate.length !== 2 || !coordinate.every((v) => typeof v === "number" && Number.isFinite(v))
      || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90) return [];
    seen.add(p.place_id);
    const source = record(p.datasource) && typeof p.datasource.attribution === "string" ? p.datasource.attribution : "© OpenStreetMap contributors";
    return [{ id: p.place_id, name, detail: typeof p.formatted === "string" ? p.formatted : typeof p.address_line2 === "string" ? p.address_line2 : "Ghana", coordinate: [coordinate[0], coordinate[1]], attribution: `Powered by Geoapify · ${source}`, ...proof(p,trustedStorage) }];
  }).slice(0, 6);
}

export function createMapboxPlacesProvider(options: PlacesOptions): PlacesProvider {
  const geoapify = options.provider === "geoapify";
  const now = options.now ?? Date.now;
  const fetcher = options.fetchImpl ?? ((...args) => fetch(...args));
  const cache = new Map<string, { expires: number; places: Place[] }>();
  let calls: number[] = [];
  return {
    clearCache: () => cache.clear(),
    details: async (place) => {
      if (!place.id || !place.name.trim() || place.coordinate.length !== 2 || !place.coordinate.every(Number.isFinite)
        || Math.abs(place.coordinate[0]) > 180 || Math.abs(place.coordinate[1]) > 90) throw new Error("Choose a valid search result.");
      return place; // Geocoding already includes the available place details and coordinates.
    },
    autocomplete: async (input, proximity, signal) => {
      const query = input.trim().replace(/\s+/g, " ");
      if (query.length < 2) return [];
      if (query.length > 256) throw new Error("Use a shorter search (up to 256 characters).");
      if (!proximity.every(Number.isFinite) || Math.abs(proximity[0]) > 180 || Math.abs(proximity[1]) > 90) throw new Error("Invalid search location.");
      if (signal?.aborted) { const aborted = new Error("Search cancelled."); aborted.name = "AbortError"; throw aborted; }
      const key = JSON.stringify([query.toLowerCase(), proximity]);
      const cached = cache.get(key);
      if (cached && cached.expires > now()) return cached.places;
      calls = calls.filter((t) => t > now() - 60_000);
      if (calls.length >= 30) throw new Error("Search limit reached. Wait a minute and try again.");
      let url: URL;
      if (options.proxyUrl) {
        url = new URL(options.proxyUrl);
        if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Search proxy must use HTTPS.");
      } else {
        if (geoapify) throw new Error("Landmark search needs the ROVA search backend. Configure EXPO_PUBLIC_PLACES_PROXY_URL; keep the Geoapify key on the server.");
        if (!options.accessToken?.startsWith("pk.")) throw new Error("Configure a public Mapbox token or a secure search proxy. Secret keys cannot be used on the phone.");
        url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
        url.searchParams.set("access_token", options.accessToken);
        url.searchParams.set("permanent", "false");
      }
      url.searchParams.set("q", query);
      // The ROVA proxy accepts only q/proximity and sets provider options itself.
      if (!options.proxyUrl) {
        url.searchParams.set("country", "GH");
        url.searchParams.set("language", "en");
        url.searchParams.set("autocomplete", "true");
        url.searchParams.set("limit", "6");
      }
      url.searchParams.set("proximity", proximity.join(","));
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(cancel, 8000);
      calls.push(now());
      try {
        const response = await fetcher(url.toString(), { signal: controller.signal });
        if (response.status === 429) throw new Error("Search is busy. Wait a minute and try again.");
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Search authorization failed. Contact support." : "Search is unavailable. Please try again.");
        if (geoapify && response.headers.get("x-rova-places-storage") !== "geoapify") throw new Error("Landmark search backend is not configured for Geoapify yet.");
        const payload: unknown = await response.json();
        const trusted=!!options.proxyUrl && response.headers.get("x-rova-places-storage") === (geoapify?"geoapify":"permanent");
        const places = geoapify ? parseGeoapifyPlaces(payload,trusted) : parsePlaces(payload,trusted);
        // Temporary geocoding forbids caching. Proxy must confirm licensed storage too.
        if ((geoapify && response.headers.get("x-rova-places-storage") === "geoapify")
          || (!geoapify && trusted)) {
          if (cache.size >= 40) cache.delete(cache.keys().next().value!);
          cache.set(key, { places, expires: now() + 300_000 });
        }
        return places;
      } catch (error) {
        if (signal?.aborted) throw error;
        if (controller.signal.aborted) throw new Error("Search timed out. Check your connection and try again.");
        if (error instanceof TypeError) throw new Error("Could not reach search. Check your internet connection.");
        if (error instanceof SyntaxError) throw new Error("Search returned an invalid response. Try again.");
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
      }
    },
  };
}

export const createGeoapifyPlacesProvider = (options: PlacesOptions): PlacesProvider =>
  createMapboxPlacesProvider({ ...options, provider: "geoapify" });
