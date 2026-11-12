import * as Location from "expo-location";
import {
  gpsSpeedToKmh,
  MAX_GPS_SPEED_AGE_MS,
  MAX_GPS_ACCURACY_METERS,
  smoothGpsSpeed,
  watchGpsSpeed,
} from "../location/speedometer";

jest.mock("expo-location", () => ({
  Accuracy: { High: 6 },
  watchPositionAsync: jest.fn(),
}));

describe("GPS speed conversion and validation", () => {
  it("converts valid GPS meters per second to kilometers per hour", () => {
    expect(
      gpsSpeedToKmh(
        {
          speedMetersPerSecond: 10,
          accuracyMeters: 8,
          timestampMs: 1_000,
        },
        1_500,
      ),
    ).toBe(36);
  });

  it.each([
    ["missing speed", null, 5, 1_000, 1_000],
    ["negative speed", -1, 5, 1_000, 1_000],
    ["missing accuracy", 10, null, 1_000, 1_000],
    ["poor accuracy", 10, MAX_GPS_ACCURACY_METERS + 1, 1_000, 1_000],
    ["stale sample", 10, 5, 1_000, 1_000 + MAX_GPS_SPEED_AGE_MS + 1],
    ["future sample", 10, 5, 1_001, 1_000],
  ])("returns unavailable for %s", (_label, speed, accuracy, timestamp, now) => {
    expect(
      gpsSpeedToKmh(
        {
          speedMetersPerSecond: speed,
          accuracyMeters: accuracy,
          timestampMs: timestamp,
        },
        now,
      ),
    ).toBeNull();
  });
});

describe("GPS speed smoothing", () => {
  it("averages a rolling window of the latest three valid readings", () => {
    const first = smoothGpsSpeed([], 30);
    const second = smoothGpsSpeed(first.readings, 60);
    const third = smoothGpsSpeed(second.readings, 90);
    const fourth = smoothGpsSpeed(third.readings, 120);

    expect(first.speedKmh).toBe(30);
    expect(second.speedKmh).toBe(45);
    expect(third.speedKmh).toBe(60);
    expect(fourth).toEqual({ readings: [60, 90, 120], speedKmh: 90 });
  });
});

describe("GPS speed watcher lifecycle", () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });

  it("uses high-accuracy foreground samples and reports a stale or missing signal as unavailable", async () => {
    jest.useFakeTimers();
    let locationCallback:
      | ((position: Location.LocationObject) => void)
      | undefined;
    const remove = jest.fn();
    jest.mocked(Location.watchPositionAsync).mockImplementation(
      async (_options, callback) => {
        locationCallback = callback;
        return { remove } as Location.LocationSubscription;
      },
    );
    const onSpeed = jest.fn();
    const onError = jest.fn();
    let now = 5_000;

    const watcher = watchGpsSpeed(onSpeed, onError, () => now);
    await Promise.resolve();

    expect(Location.watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accuracy: Location.Accuracy.High, timeInterval: 1_000 }),
      expect.any(Function),
    );

    locationCallback?.({
      coords: {
        latitude: 5.6,
        longitude: -0.18,
        altitude: null,
        accuracy: 10,
        altitudeAccuracy: null,
        heading: null,
        speed: 10,
      },
      timestamp: now,
    });
    expect(onSpeed).toHaveBeenLastCalledWith(36);

    now += MAX_GPS_SPEED_AGE_MS + 1;
    jest.advanceTimersByTime(1_000);
    expect(onSpeed).toHaveBeenLastCalledWith(null);

    watcher.stop();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("removes a watcher that resolves after the screen has unmounted", async () => {
    let resolveWatch:
      | ((subscription: Location.LocationSubscription) => void)
      | undefined;
    const remove = jest.fn();
    jest.mocked(Location.watchPositionAsync).mockReturnValue(
      new Promise((resolve) => {
        resolveWatch = resolve;
      }),
    );

    const watcher = watchGpsSpeed(jest.fn(), jest.fn());
    watcher.stop();
    resolveWatch?.({ remove } as Location.LocationSubscription);
    await Promise.resolve();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
