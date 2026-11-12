import type { ComplianceContext, ComplianceNotice } from "@rova/shared";
import { projectOnPath, routeWindow } from "@rova/shared";
import { SmartAlertEngine, type SmartAlertFlags } from "../navigation/smart-alerts";
const epoch = Date.parse("2026-11-08T00:00:00Z");
const flags: SmartAlertFlags = { enabled: true, transitions: true, corridors: true };
const notice = (extra: Partial<ComplianceNotice> = {}): ComplianceNotice => ({ id: "DEMO TEST ONLY", revision: 1, kind: "transition", distanceMeters: 200, exitDistanceMeters: 300, speedLimitKmh: 50, enforcementType: "unknown", confidence: 0.99, effectiveFrom: new Date(epoch - 1000).toISOString(), expiresAt: new Date(epoch + 86400000).toISOString(), reviewedAt: new Date(epoch - 1000).toISOString(), sourceReference: "SYNTHETIC UNIT FIXTURE, NOT A REAL RECORD", demo: false, ...extra });
const input = (second: number, speedKmh: number | null = 60, notices: ComplianceNotice[] = []) => {
  const now = epoch + second * 1000;
  const data: ComplianceContext = { fixTimestamp: now, checkedAt: now, validUntil: now + 3000, coordinate: [0, 0], validForMeters: 20, limit: { status: "verified", speedLimitKmh: 50, segmentId: "TEST ROAD", confidence: 0.99, units: "km/h" }, notices, enforcementStatus: "unavailable/unverified" };
  return { fix: { coordinate: [0, 0] as [number, number], accuracy: 5, heading: 90, timestamp: now, speed: speedKmh === null ? null : speedKmh / 3.6 }, speedKmh, reliable: true, navigating: true, progressMeters: 0, context: { data, progressMeters: 0, heading: 90 }, now, flags };
};
test("sustained overspeed needs distinct consistent fixes; hysteresis and cooldown prevent alert spam", () => {
  const engine = new SmartAlertEngine();
  for (let t = 0; t < 5; t++) expect(engine.update(input(t)).state).toBe("pending");
  const first = engine.update(input(5)); expect(first.state).toBe("overspeed"); expect(first.alert?.text).toBe("Please slow down safely");
  expect(engine.update(input(5)).alert).toBeNull();
  expect(engine.update(input(6, 52)).state).toBe("overspeed");
  expect(engine.update(input(7, 51)).state).toBe("monitoring");
  for (let t = 8; t <= 34; t++) expect(engine.update(input(t)).alert).toBeNull();
  expect(engine.update(input(35)).alert?.kind).toBe("overspeed");
});
test("noisy GPS, unavailable speed, stale network proof, new roads and monitoring interruptions reset pending overspeed", () => {
  const scenarios = [
    (v: ReturnType<typeof input>) => ({ ...v, reliable: false }),
    (v: ReturnType<typeof input>) => ({ ...v, navigating: false }),
    (v: ReturnType<typeof input>) => ({ ...v, speedKmh: null }),
    (v: ReturnType<typeof input>) => ({ ...v, fix: { ...v.fix, accuracy: 60 } }),
    (v: ReturnType<typeof input>) => ({ ...v, fix: { ...v.fix, timestamp: v.now - 11000 } }),
    (v: ReturnType<typeof input>) => ({ ...v, fix: { ...v.fix, heading: 270 } }),
    (v: ReturnType<typeof input>) => ({ ...v, context: { ...v.context, data: { ...v.context.data, checkedAt: v.now - 4000 } } }),
  ];
  for (const change of scenarios) {
    const engine = new SmartAlertEngine(); for (let t = 0; t < 4; t++) engine.update(input(t));
    expect(engine.update(change(input(4))).alert).toBeNull(); expect(engine.update(input(5)).state).toBe("pending");
    expect(engine.update(input(6)).alert).toBeNull();
  }
  const engine = new SmartAlertEngine(); engine.update(input(0)); engine.update(input(1));
  const next = input(2); if (next.context.data.limit.status === "verified") next.context.data.limit.segmentId = "OTHER TEST ROAD";
  expect(engine.update(next).alert).toBeNull(); expect(engine.update(input(10)).state).toBe("pending");
});
test("movement-bound revalidation stays unavailable and silent until fresh proof arrives, without starving sustained detection", () => {
  const engine = new SmartAlertEngine(); for (let t = 0; t <= 3; t++) engine.update(input(t));
  const pending = input(4); pending.progressMeters = 25; pending.context = input(3).context;
  expect(engine.update(pending)).toMatchObject({ state: "unavailable", limitKmh: null, alert: null });
  expect(engine.update(input(5)).alert?.kind).toBe("overspeed");
  const expired = input(6); expired.context.data.validUntil = expired.now;
  expect(engine.update(expired).limitKmh).toBeNull();
  expect(engine.update(input(7)).state).toBe("pending");
});
test("unknown limits and disabled flags cannot produce numeric limits or warnings", () => {
  const engine = new SmartAlertEngine(); const v = input(0, 100, [notice()]);
  v.context.data.limit = { status: "unknown", speedLimitKmh: null, reason: "unverified_rule" };
  expect(engine.update(v)).toMatchObject({ state: "unavailable", limitKmh: null, alert: null, upcoming: null });
  expect(engine.update({ ...input(1), flags: { ...flags, enabled: false } }).limitKmh).toBeNull();
});
test("upcoming events use geographic entry/exit hysteresis, deduplicate and never reannounce on noisy crossings", () => {
  const engine = new SmartAlertEngine(); const corridor = notice({ kind: "corridor", speedLimitKmh: null, enforcementType: "average_speed" });
  expect(engine.update(input(0, 40, [corridor, corridor])).alert?.kind).toBe("corridor");
  for (const [t, entry, exit] of [[1, 5, 105], [2, -5, 95], [3, 5, 105], [4, -25, 75], [5, -100, -25], [20, 100, 200]]) {
    expect(engine.update(input(t, 40, [notice({ ...corridor, distanceMeters: entry, exitDistanceMeters: exit })])).alert).toBeNull();
  }
  expect(engine.update(input(33, 40, [notice({ id: "OTHER DEMO", distanceMeters: 100 })])).alert?.text).toBe("Speed limit ahead: 50 kilometres per hour");
});
test("global throttling, close-turn priority, feature subflags and demo filtering suppress inappropriate upcoming prompts", () => {
  const engine = new SmartAlertEngine(); expect(engine.update(input(0, 40, [notice()])).alert?.kind).toBe("transition");
  expect(engine.update(input(1, 40, [notice({ id: "second" })])).alert).toBeNull();
  expect(engine.update({ ...input(13, 40, [notice({ id: "second" })]), suppressPrompt: true }).alert).toBeNull();
  expect(engine.update(input(14, 40, [notice({ id: "second" })])).alert?.kind).toBe("transition");
  expect(engine.update({ ...input(30, 40, [notice({ id: "third" })]), flags: { ...flags, transitions: false } }).upcoming).toBeNull();
  expect(engine.update(input(31, 40, [notice({ demo: true } as unknown as Partial<ComplianceNotice>)])).upcoming).toBeNull();
  expect(engine.update(input(32, 40, [notice({ expiresAt: new Date(epoch).toISOString() })])).alert).toBeNull();
});
test("route windows preserve bends and exclude passed geometry; looped routes are ambiguous", () => {
  const path: [number, number][] = [[0, 0], [0.002, 0], [0.002, 0.002], [0.004, 0.002]];
  const slice = routeWindow(path, 250); expect(slice).toContainEqual([0.002, 0]); expect(slice).toContainEqual([0.002, 0.002]);
  expect(projectOnPath([0.002, 0.001], slice)?.heading).toBeCloseTo(0);
  expect(projectOnPath([0.001, 0], [[0, 0], [0.002, 0], [0.002, 0.002], [0, 0.002], [0, 0], [0.002, 0]])?.ambiguous).toBe(true);
});
