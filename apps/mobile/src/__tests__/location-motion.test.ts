import { getLocationMotion } from "../map/locationMotion";
const now = 100000;
const reading = (speed: number, course: number | undefined = 90) => ({ timestamp: now, coords: { speed, course, accuracy: 8 } });
test("movement requires a usable course; stopping is distinct and small speed changes retain the last mode", () => {
  expect(getLocationMotion(reading(2), "unknown", now)).toBe("moving");
  expect(getLocationMotion(reading(0), "moving", now)).toBe("stationary");
  expect(getLocationMotion(reading(0.5), "stationary", now)).toBe("stationary");
  expect(getLocationMotion(reading(0.5), "moving", now)).toBe("moving");
  expect(getLocationMotion({ ...reading(2), coords: { speed: 2, accuracy: 8 } }, "moving", now)).toBe("unknown");
});
test("old, inaccurate, invalid or missing readings never imply standing still or a reliable direction", () => {
  expect(getLocationMotion(reading(2), "moving", now + 11000)).toBe("unknown");
  expect(getLocationMotion(null, "stationary", now)).toBe("unknown");
  expect(getLocationMotion({ ...reading(0), coords: { speed: 0, accuracy: 100 } }, "moving", now)).toBe("unknown");
  expect(getLocationMotion(reading(-1), "moving", now)).toBe("unknown");
  expect(getLocationMotion(reading(2, -1), "moving", now)).toBe("unknown");
  expect(getLocationMotion(reading(2), "moving", now - 3000)).toBe("unknown");
});
