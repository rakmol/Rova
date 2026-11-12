import * as Location from "expo-location";

export type GpsSpeedSample = {
  speedMetersPerSecond: number | null;
  accuracyMeters: number | null;
  timestampMs: number;
};

export type GpsSpeedWatch = {
  stop: () => void;
};

export const MAX_GPS_SPEED_AGE_MS = 10_000;
export const MAX_GPS_ACCURACY_METERS = 50;
const SMOOTHING_WINDOW_SIZE = 3;
const STALE_CHECK_INTERVAL_MS = 1_000;

export function gpsSpeedToKmh(
  sample: GpsSpeedSample,
  nowMs: number,
): number | null {
  const speed = sample.speedMetersPerSecond;
  const accuracy = sample.accuracyMeters;
  const ageMs = nowMs - sample.timestampMs;
  if (
    typeof speed !== "number" ||
    !Number.isFinite(speed) ||
    speed < 0 ||
    typeof accuracy !== "number" ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > MAX_GPS_ACCURACY_METERS ||
    !Number.isFinite(sample.timestampMs) ||
    ageMs < 0 ||
    ageMs > MAX_GPS_SPEED_AGE_MS
  ) {
    return null;
  }

  return speed * 3.6;
}

export function smoothGpsSpeed(
  previousReadings: readonly number[],
  nextReading: number,
): { readings: number[]; speedKmh: number } {
  const readings = [...previousReadings, nextReading].slice(-SMOOTHING_WINDOW_SIZE);
  return {
    readings,
    speedKmh: readings.reduce((total, reading) => total + reading, 0) / readings.length,
  };
}

export function watchGpsSpeed(
  onSpeed: (speedKmh: number | null) => void,
  onError: (error: Error) => void,
  now: () => number = Date.now,
): GpsSpeedWatch {
  let stopped = false;
  let latestSample: GpsSpeedSample | null = null;
  let readings: number[] = [];
  let subscription: Location.LocationSubscription | null = null;
  const startedAt = now();
  let unavailableNotified = false;

  const staleTimer = setInterval(() => {
    if (!latestSample) {
      if (!unavailableNotified && now() - startedAt > MAX_GPS_SPEED_AGE_MS) {
        unavailableNotified = true;
        onSpeed(null);
      }
      return;
    }
    if (gpsSpeedToKmh(latestSample, now()) === null) {
      latestSample = null;
      readings = [];
      unavailableNotified = true;
      onSpeed(null);
    }
  }, STALE_CHECK_INTERVAL_MS);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(staleTimer);
    subscription?.remove();
  };

  void Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 1_000,
      distanceInterval: 0,
    },
    (position) => {
      if (stopped) return;
      const sample: GpsSpeedSample = {
        speedMetersPerSecond: position.coords.speed,
        accuracyMeters: position.coords.accuracy,
        timestampMs: position.timestamp,
      };
      const speedKmh = gpsSpeedToKmh(sample, now());
      if (speedKmh === null) {
        latestSample = null;
        readings = [];
        unavailableNotified = true;
        onSpeed(null);
        return;
      }

      latestSample = sample;
      unavailableNotified = false;
      const smoothed = smoothGpsSpeed(readings, speedKmh);
      readings = smoothed.readings;
      onSpeed(smoothed.speedKmh);
    },
  )
    .then((watcher) => {
      if (stopped) watcher.remove();
      else subscription = watcher;
    })
    .catch((error: unknown) => {
      if (stopped) return;
      latestSample = null;
      readings = [];
      unavailableNotified = true;
      onSpeed(null);
      onError(
        error instanceof Error
          ? error
          : new Error("GPS speed updates could not be started."),
      );
    });

  return { stop };
}
