import { createHttpRoutingProvider } from "../routing/provider";
const fixture = { provider: "geoapify", fetchedAt: "2026-11-07T00:00:00Z", warnings: [], routes: [{ id: "test", label: "Test sample route", geometry: { type: "LineString", coordinates: [[-0.187, 5.6037], [-0.173, 5.622]] }, distanceMeters: 4500, durationSeconds: 600, maneuvers: [], tolls: "unknown", trafficAware: false, etaKind: "static_estimate", isSample: true, attribution: "Automated test fixture" }] };
test("routing HTTP contract sends coordinates, validates the static-estimate response and preserves sample metadata", async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => fixture });
  const provider = createHttpRoutingProvider("https://api.example.com/routes", fetcher);
  expect((await provider.routes([-0.187, 5.6037], [-0.173, 5.622])).routes[0].isSample).toBe(true);
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("origin")).toBe("-0.187,5.6037");
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ...fixture, routes: [] }) });
  expect((await provider.routes([-0.187, 5.6037], [-0.173, 5.622])).routes).toEqual([]);
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ...fixture, routes: [{ ...fixture.routes[0], trafficAware: true }] }) });
  await expect(provider.routes([-0.187, 5.6037], [-0.173, 5.622])).rejects.toThrow(/invalid route/);
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ...fixture, warnings: [{}] }) });
  await expect(provider.routes([-0.187, 5.6037], [-0.173, 5.622])).rejects.toThrow(/invalid response/);
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ...fixture, routes: [{ ...fixture.routes[0], maneuvers: [{ instruction: "Test", distanceMeters: -10, durationSeconds: null }] }] }) });
  await expect(provider.routes([-0.187, 5.6037], [-0.173, 5.622])).rejects.toThrow(/invalid route/);
});
test("routing cancellation, configuration and connectivity failures never yield sample routes", async () => {
  const fetcher = jest.fn().mockRejectedValue(new TypeError("offline"));
  const provider = createHttpRoutingProvider("https://api.example.com/routes", fetcher);
  await expect(provider.routes([-0.187, 5.6037], [-0.173, 5.622])).rejects.toThrow(/connection/);
  const controller = new AbortController(); controller.abort();
  await expect(provider.routes([-0.187, 5.6037], [-0.173, 5.622], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  await expect(createHttpRoutingProvider(undefined).routes([-0.187, 5.6037], [-0.173, 5.622])).rejects.toThrow(/backend/);
});
