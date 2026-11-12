import { fetchComplianceContext } from "../navigation/compliance-client";
import type { ComplianceContext } from "@rova/shared";
const fix = { coordinate: [0, 0] as [number, number], timestamp: 1000000, heading: 90, accuracy: 5, speed: 10 };
const path: [number, number][] = [[0, 0], [0.001, 0]];
const data = (): ComplianceContext => ({ fixTimestamp: fix.timestamp, checkedAt: fix.timestamp, validUntil: fix.timestamp + 3000, coordinate: fix.coordinate, validForMeters: 20,
  limit: { status: "verified", speedLimitKmh: 50, segmentId: "TEST ROAD", confidence: 0.99, units: "km/h" }, notices: [], enforcementStatus: "unavailable/unverified" });
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
test("compliance transport sends vehicle class, original fix time and bounded route with abort support", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => data() }); global.fetch = fetchMock;
  const signal = new AbortController().signal;
  await fetchComplianceContext(fix, path, signal, "bus", "https://example.test/safety/alert-context");
  const request = fetchMock.mock.calls[0][1]; expect(request.signal).toBe(signal);
  expect(JSON.parse(request.body).fix).toMatchObject({ timestamp: fix.timestamp, vehicleType: "bus" });
});
test("transport rejects mismatched GPS bindings, nonfinite limits, invalid metadata and unofficial mobile-camera records", async () => {
  const invalid = [
    { ...data(), fixTimestamp: fix.timestamp - 1 }, { ...data(), coordinate: [1, 1] }, { ...data(), validUntil: fix.timestamp + 60000 },
    { ...data(), limit: { status: "verified", speedLimitKmh: NaN, segmentId: "test", confidence: 0.99, units: "km/h" } },
    { ...data(), notices: [{ id: "DEMO", revision: 1, kind: "corridor", distanceMeters: 100, exitDistanceMeters: 200, confidence: 0.99, effectiveFrom: new Date().toISOString(), expiresAt: new Date().toISOString(), reviewedAt: new Date().toISOString(), sourceReference: "UNOFFICIAL TEST", enforcementType: "mobile_camera", demo: false }] },
  ];
  for (const payload of invalid) { global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload }); await expect(fetchComplianceContext(fix, path, new AbortController().signal, "private_car", "https://example.test/")).rejects.toThrow(); }
});
test("transport fails closed for network errors and insecure remote endpoints", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  await expect(fetchComplianceContext(fix, path, new AbortController().signal, "private_car", "https://example.test/")).rejects.toThrow(/unavailable/);
  await expect(fetchComplianceContext(fix, path, new AbortController().signal, "private_car", "http://example.test/")).rejects.toThrow(/HTTPS/);
});
test('transport keeps unverified road advisories separate from an unknown legal limit',async()=>{
  const payload={...data(),limit:{status:'unknown',speedLimitKmh:null,reason:'no_road_match'},reportedRoads:{status:'available',validUntil:fix.timestamp+5000,notices:[{id:'DEMO',roadName:'DEMO ROAD',verification:'unverified',scope:'named_road_not_camera',distanceMeters:200,exitDistanceMeters:400,sourceUrl:'https://example.com/report',reportedAt:'2026-11-08'}]}};
  global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>payload});
  const response=await fetchComplianceContext(fix,path,new AbortController().signal,'private_car','https://example.test/');expect(response.limit.status).toBe('unknown');expect(response.reportedRoads?.notices).toHaveLength(1);
  payload.reportedRoads.notices[0].verification='verified';await expect(fetchComplianceContext(fix,path,new AbortController().signal,'private_car','https://example.test/')).rejects.toThrow(/unverified/);
});
