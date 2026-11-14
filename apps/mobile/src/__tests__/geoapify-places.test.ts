import { createGeoapifyPlacesProvider, parseGeoapifyPlaces } from "../places/provider";
const feature = { properties: { place_id: "test-market", name: "Test Market", formatted: "Test Market, Ghana", country_code: "gh", result_type: "amenity", datasource: { attribution: "© OpenStreetMap contributors" } }, geometry: { type: "Point", coordinates: [-0.2, 5.6] } };
const street = { properties: { ...feature.properties, place_id: "test-road", name: undefined, address_line1: "Test Street", result_type: "street" }, geometry: feature.geometry };
const response = () => ({ ok: true, status: 200, headers: { get: () => "geoapify" }, json: async () => ({ features: [feature, street] }) });

test("one search adapter accepts both real provider street and landmark records, with attribution", async () => {
  const fetcher = jest.fn().mockResolvedValue(response());
  const provider = createGeoapifyPlacesProvider({ proxyUrl: "https://api.example.com/v1/places/search", fetchImpl: fetcher });
  const results = await provider.autocomplete("Test", [-0.187, 5.6037]);
  expect([...new URL(fetcher.mock.calls[0][0]).searchParams.keys()].sort()).toEqual(['proximity', 'q']);
  expect(results.map((p) => p.name)).toEqual(["Test Market", "Test Street"]);
  expect(results[0].attribution).toContain("Geoapify");
  expect(results[0].attribution).toContain("OpenStreetMap");
  expect(await provider.details(results[0])).toEqual(results[0]);
  await provider.autocomplete("Test", [-0.187, 5.6037]);
  await provider.autocomplete("Test", [-0.18701, 5.60371]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).not.toContain("apiKey");
  const wrongCountry = { ...feature, properties: { ...feature.properties, country_code: "us" } };
  expect(parseGeoapifyPlaces({ features: [feature, feature, wrongCountry, { ...street, geometry: { coordinates: [181, 5] } }] })).toHaveLength(1);
  expect(parseGeoapifyPlaces({ features: [] })).toEqual([]);
});

test("landmark mode fails clearly for missing proxy or a backend configured for a different provider", async () => {
  await expect(createGeoapifyPlacesProvider({}).autocomplete("Test", [-0.187, 5.6037])).rejects.toThrow(/needs the ROVA search backend/);
  const fetcher = jest.fn().mockResolvedValue({ ...response(), headers: { get: () => "temporary" } });
  const provider = createGeoapifyPlacesProvider({ proxyUrl: "https://api.example.com/v1/places/search", fetchImpl: fetcher });
  await expect(provider.autocomplete("Test", [-0.187, 5.6037])).rejects.toThrow(/not configured for Geoapify/);
});
