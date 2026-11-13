import type { RoutingOption } from "@rova/shared";
import { NavigationMachine, VoiceGate, type Fix } from "../navigation/session";
const route: RoutingOption = { id: "test-route", label: "Automated test route", geometry: { type: "LineString", coordinates: [[0, 0], [0.005, 0], [0.005, 0.005]] }, distanceMeters: 1112, durationSeconds: 200, maneuvers: [{ instruction: "Test departure", geometryIndex: 0, distanceMeters: 556, durationSeconds: 100 }, { instruction: "Turn left at test junction", geometryIndex: 1, distanceMeters: 556, durationSeconds: 100 }], tolls: "unknown", trafficAware: false, etaKind: "static_estimate", isSample: false, attribution: "Test fixture only" };
const epoch = 1000000;
const fix = (coordinate: [number, number], seconds = 0, extras: Partial<Fix> = {}): Fix => ({ coordinate, timestamp: epoch + seconds * 1000, accuracy: 8, heading: 90, speed: 10, ...extras });
function started() { const machine = new NavigationMachine(); machine.preview(route); machine.start(); return machine; }

test('map fixes keep moving while direction confirmation holds route progress, and reject bad GPS', () => {
  const machine = started(); machine.update(fix([0.001,0]),epoch);
  const before = machine.snapshot.progress;
  const current = fix([0.0012,0],1,{heading:270});
  machine.update(current,epoch+1000);
  expect(machine.snapshot.progress).toBe(before);
  expect(machine.snapshot.gpsReliable).toBe(false);
  expect(machine.locationFix).toBe(current);
  machine.update(fix([0.002,0],2,{accuracy:80}),epoch+2000);
  expect(machine.locationFix).toBe(current);
});
test("session moves idle -> previewing -> navigating; progress uses projected geometry and located provider maneuvers", () => {
  const machine = new NavigationMachine(); expect(machine.snapshot.state).toBe("idle");
  machine.preview(route); expect(machine.snapshot.state).toBe("previewing"); machine.start();
  machine.update(fix([0.001, 0]), epoch);
  expect(machine.snapshot.state).toBe("navigating"); expect(machine.snapshot.gpsReliable).toBe(true);
  expect(machine.snapshot.progress?.turnMeters).toBeCloseTo(445, -1);
  expect(machine.snapshot.progress?.instruction).toBe("Turn left at test junction");
  const previous = machine.snapshot.progress!;
  machine.update(fix([0.002, 0], 3), epoch + 3000);
  expect(machine.snapshot.progress!.remainingMeters).toBeLessThan(previous.remainingMeters);
  expect(machine.snapshot.progress!.remainingSeconds).toBeLessThan(previous.remainingSeconds);
});
test("poor, stale, future and jumping GPS fixes suspend guidance and cannot advance progress or trigger rerouting", () => {
  for (const bad of [fix([0.004, 0], 3, { accuracy: 80 }), fix([0.004, 0], -30), fix([0.004, 0], 30), fix([0.005, 0.005], 1), fix([0.004, 0], 3, { accuracy: null })]) {
    const machine = started(); machine.update(fix([0.001, 0]), epoch); const before = machine.snapshot.progress;
    machine.update(bad, epoch + 3000);
    expect(machine.snapshot.gpsReliable).toBe(false); expect(machine.snapshot.progress).toBe(before);
    expect(machine.beginReroute(epoch + 3000)).toBe(false);
  }
  const machine = started(); machine.update(fix([0.001, 0]), epoch); machine.stale(epoch + 11000);
  expect(machine.snapshot.gpsReliable).toBe(false);
});
test("deviation requires three consistent fixes across five seconds and reroutes at most once per thirty seconds", () => {
  const machine = started();
  machine.update(fix([0.001, 0.001]), epoch); expect(machine.snapshot.state).toBe("navigating");
  machine.update(fix([0.001, 0.001], 3), epoch + 3000); expect(machine.beginReroute(epoch + 3000)).toBe(false);
  machine.update(fix([0.001, 0.001], 6), epoch + 6000); expect(machine.snapshot.state).toBe("off-route");
  expect(machine.beginReroute(epoch + 6000)).toBe(true); expect(machine.snapshot.state).toBe("rerouting");
  machine.rerouteFailed(); expect(machine.snapshot.state).toBe("off-route");
  expect(machine.beginReroute(epoch + 20000)).toBe(false); expect(machine.beginReroute(epoch + 37000)).toBe(true);
});
test("fresh stationary fixes keep guidance active; a GPS gap retains the route and recovers without restarting", () => {
  const machine = started(); const gate = new VoiceGate();
  machine.update(fix([0.003, 0], 0, { speed: 0 }), epoch);
  for (let seconds = 1; seconds <= 20; seconds++) {
    machine.update(fix([0.003, 0], seconds, { speed: 0 }), epoch + seconds * 1000);
    machine.stale(epoch + seconds * 1000);
    expect(machine.snapshot.gpsReliable).toBe(true);
  }
  const before = machine.snapshot.progress;
  machine.stale(epoch + 31000);
  expect(machine.snapshot.state).toBe("navigating");
  expect(machine.snapshot.progress).toBe(before); expect(machine.snapshot.route).toBe(route);
  expect(gate.next(machine.snapshot, false, epoch + 31000)).toBeNull();
  expect(machine.beginReroute(epoch + 31000)).toBe(false);
  machine.update(fix([0.003, 0], 32, { speed: 0 }), epoch + 32000);
  expect(machine.snapshot.gpsReliable).toBe(true); expect(machine.snapshot.state).toBe("navigating");
});
test("wrong-way driving triggers confirmation, while one noisy fix followed by recovery does not", () => {
  const machine = started();
  for (const seconds of [0, 3, 6]) machine.update(fix([0.001, 0], seconds, { heading: 270 }), epoch + seconds * 1000);
  expect(machine.snapshot.state).toBe("off-route"); expect(machine.snapshot.message).toMatch(/Wrong direction/);
  const recovered = started(); recovered.update(fix([0.001, 0.001]), epoch); recovered.update(fix([0.001, 0], 3), epoch + 3000);
  expect(recovered.snapshot.state).toBe("navigating"); expect(recovered.beginReroute(epoch + 6000)).toBe(false);
  const inferred = started();
  for (let i = 0; i < 4; i++) inferred.update(fix([0.003 - i * 0.0002, 0], i * 3, { heading: null, speed: null }), epoch + i * 3000);
  expect(inferred.snapshot.state).toBe("off-route");
});
test("pause freezes progress, resume requires fresh GPS, arrival requires multiple fixes and terminal/error states are explicit", () => {
  const machine = started(); machine.update(fix([0.004, 0]), epoch); machine.pause(); const before = machine.snapshot.progress;
  machine.update(fix([0.005, 0.005], 10), epoch + 10000); expect(machine.snapshot.state).toBe("paused"); expect(machine.snapshot.progress).toBe(before);
  machine.resume(); expect(machine.snapshot.gpsReliable).toBe(false);
  for (const seconds of [20, 23]) { machine.update(fix([0.005, 0.005], seconds, { speed: 0, heading: null }), epoch + seconds * 1000); expect(machine.snapshot.state).toBe("navigating"); }
  machine.update(fix([0.005, 0.005], 26, { speed: 0, heading: null }), epoch + 26000); expect(machine.snapshot.state).toBe("arrived");
  machine.stop(); expect(machine.snapshot.state).toBe("idle"); machine.fail("test failure"); expect(machine.snapshot.state).toBe("error");
});
test("voice announces approach and close instructions once, respecting mute, pauses, GPS uncertainty and cooldown", () => {
  const machine = started(); const gate = new VoiceGate(); machine.update(fix([0.003, 0]), epoch);
  expect(gate.next(machine.snapshot, true, epoch)).toBeNull();
  expect(gate.next(machine.snapshot, false, epoch)).toMatch(/In 220 metres/);
  expect(gate.next(machine.snapshot, false, epoch + 9000)).toBeNull();
  machine.update(fix([0.0048, 0], 10), epoch + 10000);
  expect(gate.next(machine.snapshot, false, epoch + 10000)).toBe("Turn left at test junction");
  expect(gate.next(machine.snapshot, false, epoch + 20000)).toBeNull();
  machine.pause(); expect(new VoiceGate().next(machine.snapshot, false, epoch + 20000)).toBeNull();
  machine.resume(); expect(new VoiceGate().next(machine.snapshot, false, epoch + 20000)).toBeNull();
});
test("loop proximity does not jump progress ahead and samples or unlocated maneuvers cannot start guidance", () => {
  const machine = new NavigationMachine();
  machine.preview({ ...route, geometry: { type: "LineString", coordinates: [[0, 0], [0.005, 0], [0.005, 0.005], [0, 0.005], [0, 0.0001], [0.006, 0.0001]] } }); machine.start();
  machine.update(fix([0.0001, 0]), epoch); machine.update(fix([0.0001, 0.0001], 3), epoch + 3000);
  expect(machine.snapshot.progress!.along).toBeLessThan(50);
  expect(() => machine.preview({ ...route, isSample: true })).toThrow(/Sample/);
  expect(() => machine.preview({ ...route, maneuvers: [] })).toThrow(/unlocated/);
  expect(() => machine.preview({ ...route, maneuvers: [...route.maneuvers, { instruction: "Unlocated test turn", distanceMeters: null, durationSeconds: null }] })).toThrow(/unlocated/);
});
