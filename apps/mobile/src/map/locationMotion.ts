export type LocationMotion = "moving" | "stationary" | "unknown";
export type MotionReading = { timestamp?: number; coords: { speed?: number; course?: number; accuracy?: number } };

// Hysteresis keeps minor speed fluctuations from switching the marker at every fix.
export function getLocationMotion(reading: MotionReading | null, previous: LocationMotion, now: number): LocationMotion {
  if (!reading || typeof reading.timestamp !== "number" || !Number.isFinite(reading.timestamp) || now - reading.timestamp > 10000 || reading.timestamp > now + 2000) return "unknown";
  const { speed, course, accuracy } = reading.coords;
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 35 || typeof speed !== "number" || !Number.isFinite(speed) || speed < 0 || speed > 60) return "unknown";
  if (speed <= 0.3) return "stationary";
  const hasCourse = typeof course === "number" && Number.isFinite(course) && course >= 0 && course < 360;
  if (speed >= 0.8) return hasCourse ? "moving" : "unknown";
  if (previous === "moving" && !hasCourse) return "unknown";
  return previous;
}
