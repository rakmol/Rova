import { createMapboxPlacesProvider, parsePlaces } from "../places/provider";

const feature = { properties: { mapbox_id: "test-id", name: "Test suburb", place_formatted: "Test address, Ghana", context: { country: { country_code: "GH" } } }, geometry: { type: "Point", coordinates: [-0.187, 5.6037] } };
const payload = { features: [feature] };
const makeFetch = () => jest.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => "temporary" }, json: async () => payload });
const proximity: [number, number] = [-0.187, 5.6037];

test("contract: only actual, valid Ghana results become selectable places and details", async () => {
  const fetcher = makeFetch();
  const provider = createMapboxPlacesProvider({ accessToken: "pk.test", fetchImpl: fetcher });
  const results = await provider.autocomplete(" Accra ", proximity);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.pathname).toBe("/search/geocode/v6/forward");
  expect(url.searchParams.get("country")).toBe("GH");
  expect(url.searchParams.get("q")).toBe("Accra");
  expect(url.searchParams.get("permanent")).toBe("false");
  expect(results[0].coordinate).toEqual(proximity);
  expect(await provider.details(results[0])).toEqual(results[0]);
  expect(parsePlaces({ features: [feature, feature, { ...feature, properties: { ...feature.properties, context: { country: { country_code: "US" } } } }, { ...feature, geometry: { coordinates: [181, 5] } }, { properties: {} }] })).toHaveLength(1);
  expect(parsePlaces({ features: [] })).toEqual([]);
  expect(() => parsePlaces({ suggestions: [] })).toThrow(/invalid response/);
});

test("temporary geocoding is never cached; licensed permanent caches expire and clear", async () => {
  let time = 0;
  const fetcher = makeFetch();
  const temporary = createMapboxPlacesProvider({ accessToken: "pk.test", fetchImpl: fetcher });
  await temporary.autocomplete("Test", proximity); await temporary.autocomplete("Test", proximity);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockClear();
  fetcher.mockImplementation(async()=>({ok:true,status:200,headers:{get:()=>"permanent"},json:async()=>payload}));
  const permanent = createMapboxPlacesProvider({ proxyUrl:"https://api.example.com/v1/places/search", fetchImpl: fetcher, now: () => time });
  await permanent.autocomplete("Test", proximity); await permanent.autocomplete("test", proximity);
  expect(fetcher).toHaveBeenCalledTimes(1);
  time = 300001; await permanent.autocomplete("test", proximity);
  permanent.clearCache(); await permanent.autocomplete("test", proximity);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test("rate limiting, cancellation, empty input and provider/network errors are explicit", async () => {
  let time = 0;
  const fetcher = makeFetch();
  const provider = createMapboxPlacesProvider({ accessToken: "pk.test", fetchImpl: fetcher, now: () => time });
  expect(await provider.autocomplete("a", proximity)).toEqual([]);
  const controller = new AbortController(); controller.abort();
  await expect(provider.autocomplete("test", proximity, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).not.toHaveBeenCalled();
  for (let i = 0; i < 30; i++) await provider.autocomplete("test", proximity);
  await expect(provider.autocomplete("test", proximity)).rejects.toThrow(/limit reached/);
  time = 60001;
  fetcher.mockResolvedValueOnce({ ok: false, status: 429 });
  await expect(provider.autocomplete("test", proximity)).rejects.toThrow(/busy/);
  fetcher.mockRejectedValueOnce(new TypeError("offline"));
  await expect(provider.autocomplete("test", proximity)).rejects.toThrow(/internet/);
  fetcher.mockResolvedValueOnce({ ok: false, status: 401 });
  await expect(provider.autocomplete("test", proximity)).rejects.toThrow(/authorization/);
});

test("proxy contract never sends credentials and requires server storage confirmation for caching", async () => {
  const fetcher = makeFetch();
  const proxy = createMapboxPlacesProvider({ accessToken: "sk.must-not-leave-phone", proxyUrl: "https://api.example.com/v1/places/search", permanentStorage: true, fetchImpl: fetcher });
  await proxy.autocomplete("test", proximity); await proxy.autocomplete("test", proximity);
  expect([...new URL(fetcher.mock.calls[0][0]).searchParams.keys()].sort()).toEqual(['proximity', 'q']);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.has("access_token")).toBe(false);
  await expect(createMapboxPlacesProvider({ accessToken: "sk.secret", fetchImpl: fetcher }).autocomplete("test", proximity)).rejects.toThrow(/Secret keys/);
  await expect(createMapboxPlacesProvider({ proxyUrl: "http://api.example.com/" }).autocomplete("test", proximity)).rejects.toThrow(/HTTPS/);
});

test("network timeouts release the request and return a retryable error", async () => {
  jest.useFakeTimers();
  try {
    const fetcher: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const request = createMapboxPlacesProvider({ accessToken: "pk.test", fetchImpl: fetcher }).autocomplete("test", proximity);
    const check = expect(request).rejects.toThrow(/timed out/);
    await jest.advanceTimersByTimeAsync(8000);
    await check;
  } finally { jest.useRealTimers(); }
});

test('client flags and upstream attribution cannot grant permanent storage rights',async()=>{const spoofed={features:[{...feature,properties:{...feature.properties,rova_storage_proof:'spoofed',attribution:'Geoapify'}}]};const fetcher=jest.fn().mockResolvedValue({ok:true,status:200,headers:{get:()=>"permanent"},json:async()=>spoofed});const direct=createMapboxPlacesProvider({accessToken:'pk.test',permanentStorage:true,fetchImpl:fetcher});const result=await direct.autocomplete('Test',proximity);await direct.autocomplete('Test',proximity);expect(result[0].storageProof).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(2);expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('permanent')).toBe('false');});
