import {networkObservation} from "../offline/network";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import type { RoutingOption, RoutingResponse } from "@rova/shared";
import { useNavigationSession } from "../navigation/useNavigationSession";
import { routingProvider } from "../routing/runtime";
import { fetchComplianceContext } from "../navigation/compliance-client";
const mockHazards = { reports: [] as import('@rova/shared').CommunityIncident[], checkedAt: null as number|null, stale: true, transport: 'stream' as const, truncated: false };
jest.mock('../incidents/useHazardFeed',()=>({useHazardFeed:()=>mockHazards}));
const mockStop = jest.fn(); const mockSpeak = jest.fn();
jest.mock("../navigation/voice", () => ({ speechAvailable: true, createVoicePlayer: () => ({ stop: mockStop, speak: mockSpeak }) }));
jest.mock("../routing/runtime", () => ({ routingProvider: { routes: jest.fn() } }));
jest.mock("../navigation/compliance-client", () => ({ fetchComplianceContext: jest.fn() }));
jest.mock("expo-location", () => ({ Accuracy: { BestForNavigation: 6 }, requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), watchPositionAsync: jest.fn() }));
const route: RoutingOption = { id: "hook-test", label: "Test fixture", geometry: { type: "LineString", coordinates: [[0, 0], [0.005, 0], [0.005, 0.005]] }, distanceMeters: 1112, durationSeconds: 200, maneuvers: [{ instruction: "Test turn", geometryIndex: 1, distanceMeters: 556, durationSeconds: 100 }], tolls: "unknown", trafficAware: false, etaKind: "static_estimate", isSample: false, attribution: "Test only" };
let now: number;
const sample = (off = false): Location.LocationObject => ({ timestamp: now, coords: { longitude: 0.003, latitude: off ? 0.001 : 0, accuracy: 8, altitude: null, altitudeAccuracy: null, speed: 10, heading: 90 } });
let callback: (location: Location.LocationObject) => void;
const remove = jest.fn();
let changeAppState: (state: AppStateStatus) => void;
beforeEach(() => {
  networkObservation({isConnected:true,isInternetReachable:true});
  jest.clearAllMocks(); now = 1000000; jest.spyOn(Date, "now").mockImplementation(() => now);
  mockHazards.reports=[];mockHazards.checkedAt=null;mockHazards.stale=true;
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true, writable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, handler) => { changeAppState = handler; return { remove: jest.fn() }; });
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
  jest.mocked(Location.getCurrentPositionAsync).mockImplementation(async () => sample());
  jest.mocked(Location.watchPositionAsync).mockImplementation(async (_, handler) => { callback = handler; return { remove }; });
  jest.mocked(fetchComplianceContext).mockRejectedValue(new Error("Test data unavailable"));
});
afterEach(() => jest.restoreAllMocks());

test('navigation speaks community congestion once, without requiring a numeric speed limit',async()=>{
  mockHazards.stale=false;mockHazards.checkedAt=now;
  mockHazards.reports=[{id:'hook-congestion',category:'congestion',status:'verified',coordinate:[.0045,0],approximateRadiusMeters:150,reportedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString(),revision:1,confirmations:1,notThere:0,confidence:.5,evidence:'community',authorityVerified:false}];
  const hook=await renderHook(()=>useNavigationSession([.005,.005],route));await waitFor(()=>expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1));
  for(let i=0;i<16;i++){now+=1000;await act(async()=>callback(sample()));}
  expect(mockSpeak.mock.calls.filter(([text])=>String(text).startsWith('Possible congestion'))).toHaveLength(1);
  expect(hook.result.current.congestionAlert?.id).toBe('hook-congestion');
  await hook.unmount();
});

test("navigation speaks the unverified road prompt even when the legal speed limit is unknown, without repeating it", async () => {
  jest.mocked(fetchComplianceContext).mockImplementation(async(fix)=>({fixTimestamp:fix.timestamp,checkedAt:now,validUntil:now,coordinate:fix.coordinate,validForMeters:0,
    limit:{status:'unknown',speedLimitKmh:null,reason:'no_road_match'},notices:[],enforcementStatus:'unavailable/unverified',reportedRoads:{status:'available',validUntil:now+5000,notices:[{id:'TEST-REPORTED-ROAD',roadName:'DEMO ROAD',verification:'unverified',scope:'named_road_not_camera',distanceMeters:200,exitDistanceMeters:450,sourceUrl:'https://example.com/report',reportedAt:'2026-11-08'}]}}));
  const hook=await renderHook(()=>useNavigationSession([0.005,0.005],route));await waitFor(()=>expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1));
  for(let i=0;i<16;i++){now+=1000;await act(async()=>callback(sample()));}
  expect(hook.result.current.smartAlerts.limitKmh).toBeNull();expect(hook.result.current.reportedRoadAlert.nearby?.roadName).toBe('DEMO ROAD');
  const prompts=mockSpeak.mock.calls.filter(([text])=>String(text).startsWith('Reported enforcement'));expect(prompts).toHaveLength(1);expect(prompts[0][0]).toContain('Unverified. Follow posted speed limits.');
  await hook.unmount();
});

test("alert audio opt-out preserves visual compliance and never replays a muted warning on opt-in", async () => {
  jest.mocked(fetchComplianceContext).mockImplementation(async (fix) => ({ fixTimestamp: fix.timestamp, checkedAt: now, validUntil: now + 3000, coordinate: fix.coordinate, validForMeters: 20,
    limit: { status: "verified", speedLimitKmh: 20, segmentId: "ISOLATED TEST ROAD", confidence: 0.99, units: "km/h" }, notices: [], enforcementStatus: "unavailable/unverified" }));
  const hook = await renderHook(() => useNavigationSession([0.005, 0.005], route));
  await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1));
  await act(async () => hook.result.current.toggleAlertAudio());
  for (let i = 0; i < 14; i++) { now += 1000; await act(async () => callback(sample())); }
  expect(hook.result.current.smartAlerts.state).toBe("overspeed");
  expect(mockSpeak).not.toHaveBeenCalledWith("Please slow down safely");
  await act(async () => hook.result.current.toggleAlertAudio()); now += 1000; await act(async () => callback(sample()));
  expect(mockSpeak).not.toHaveBeenCalledWith("Please slow down safely");
  await hook.unmount();
});
test("a permission activity can background startup without cancelling guidance; startup waits for foreground", async () => {
  let grant!: (permission: Location.LocationPermissionResponse) => void;
  jest.mocked(Location.requestForegroundPermissionsAsync).mockImplementationOnce(() => new Promise((resolve) => { grant = resolve; }));
  const hook = await renderHook(() => useNavigationSession([0.005, 0.005], route));
  await waitFor(() => expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled());
  await act(async () => { changeAppState("background"); grant({ granted: true } as Location.LocationPermissionResponse); });
  expect(hook.result.current.snapshot.state).not.toBe("error");
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  await act(async () => changeAppState("active"));
  await waitFor(() => expect(hook.result.current.snapshot.state).toBe("navigating"));
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  await act(async () => changeAppState("background"));
  expect(hook.result.current.snapshot.state).toBe("paused"); expect(remove).toHaveBeenCalled();
  await act(async () => changeAppState("inactive"));
  await act(async () => changeAppState("active"));
  expect(hook.result.current.snapshot.state).toBe("navigating");
  expect(hook.result.current.snapshot.gpsReliable).toBe(false);
  await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalledTimes(2));
  now += 3000; await act(async () => callback(sample()));
  expect(hook.result.current.snapshot.gpsReliable).toBe(true);
  await hook.unmount();
});
test("ending while startup waits for foreground prevents late foreground events from starting guidance", async () => {
  Object.defineProperty(AppState, "currentState", { value: "background", configurable: true, writable: true });
  const hook = await renderHook(() => useNavigationSession([0.005, 0.005], route));
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  await act(async () => hook.result.current.stop());
  await act(async () => changeAppState("active"));
  expect(hook.result.current.snapshot.state).toBe("idle");
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  await hook.unmount();
});
test("mute leaves navigation active; pause removes GPS watch and resume waits for fresh GPS", async () => {
  const hook = await renderHook(() => useNavigationSession([0.005, 0.005], route));
  await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1));
  expect(Location.watchPositionAsync).toHaveBeenCalledWith(expect.objectContaining({ distanceInterval: 0, timeInterval: 1000 }), expect.any(Function), expect.any(Function));
  expect(mockSpeak).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.toggleMuted());
  expect(hook.result.current.snapshot.state).toBe("navigating"); expect(hook.result.current.muted).toBe(true); expect(mockStop).toHaveBeenCalled();
  await act(async () => hook.result.current.pause()); expect(hook.result.current.snapshot.state).toBe("paused"); expect(remove).toHaveBeenCalled();
  await act(async () => { changeAppState("background"); changeAppState("active"); });
  expect(hook.result.current.snapshot.state).toBe("paused");
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.resume()); expect(hook.result.current.snapshot.gpsReliable).toBe(false);
  await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalledTimes(2));
  now += 3000; await act(async () => callback(sample()));
  expect(hook.result.current.snapshot.gpsReliable).toBe(true); expect(mockSpeak).toHaveBeenCalledTimes(1);
  await hook.unmount();
});
test("pause aborts an in-flight reroute; late responses cannot restart a paused session", async () => {
  let resolve!: (result: RoutingResponse) => void;
  jest.mocked(routingProvider.routes).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const hook = await renderHook(() => useNavigationSession([0.005, 0.005], route));
  await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1));
  for (let i = 0; i < 3; i++) { now += 3000; await act(async () => callback(sample(true))); }
  expect(hook.result.current.snapshot.state).toBe("rerouting");
  const signal = jest.mocked(routingProvider.routes).mock.calls[0][2];
  await act(async () => hook.result.current.pause()); expect(signal?.aborted).toBe(true);
  await act(async () => resolve({ provider: "geoapify", routes: [route], fetchedAt: "2026-11-07T00:00:00Z", warnings: [] }));
  expect(hook.result.current.snapshot.state).toBe("paused");
  await hook.unmount();
});
test("an older selected preview without maneuver positions cannot silently switch to a different route", async () => {
  const selected = { ...route, maneuvers: [{ instruction: "Unlocated test", distanceMeters: 556, durationSeconds: 100 }] };
  const hook = await renderHook(() => useNavigationSession([0.005, 0.005], selected));
  await waitFor(() => expect(hook.result.current.snapshot.state).toBe("error"));
  expect(hook.result.current.snapshot.message).toMatch(/select it again/);
  expect(routingProvider.routes).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  await hook.unmount();
});
test("ending during the permission request prevents a late grant from starting location acquisition", async () => {
  let grant!: (permission: Location.LocationPermissionResponse) => void;
  jest.mocked(Location.requestForegroundPermissionsAsync).mockImplementationOnce(() => new Promise((resolve) => { grant = resolve; }));
  const hook = await renderHook(() => useNavigationSession([0.005, 0.005], route));
  await waitFor(() => expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled());
  await hook.unmount();
  await act(async () => grant({ granted: true } as Location.LocationPermissionResponse));
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});
test("ending while the initial OS location request is pending clears the wait and ignores its late result", async () => {
  let locate!: (location: Location.LocationObject) => void;
  jest.mocked(Location.getCurrentPositionAsync).mockImplementationOnce(() => new Promise((resolve) => { locate = resolve; }));
  const hook = await renderHook(() => useNavigationSession([0.005, 0.005], route));
  await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalled());
  await hook.unmount();
  await act(async () => locate(sample()));
  expect(Location.watchPositionAsync).not.toHaveBeenCalled(); expect(mockSpeak).not.toHaveBeenCalled();
});


test('airplane mode keeps GPS guidance on the selected path and suppresses online safety and rerouting',async()=>{
 networkObservation({isConnected:false,isInternetReachable:false});
 const hook=await renderHook(()=>useNavigationSession([.005,.005],route));
 await waitFor(()=>expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1));
 expect(hook.result.current.snapshot.route?.id).toBe(route.id);
 expect(fetchComplianceContext).not.toHaveBeenCalled();
 for(let i=0;i<3;i++){now+=3000;await act(async()=>callback(sample(true)));}
 expect(routingProvider.routes).not.toHaveBeenCalled();
 expect(hook.result.current.snapshot.message).toMatch(/Reconnect/);
 expect(hook.result.current.smartAlerts.limitKmh).toBeNull();
 await hook.unmount();networkObservation({isConnected:true,isInternetReachable:true});
});
