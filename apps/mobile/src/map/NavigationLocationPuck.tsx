import { useEffect, useState } from "react";
import Mapbox, { Images, LocationPuck } from "@rnmapbox/maps";
import { getLocationMotion, type LocationMotion, type MotionReading } from "./locationMotion";
import type { Fix } from '../navigation/session';

const markerImages = {
  "rova-navigation-moving": require("../../assets/images/navigation/moving.png"),
  "rova-navigation-stationary": require("../../assets/images/navigation/stationary.png"),
  "rova-navigation-unknown": require("../../assets/images/navigation/unknown.png"),
  "rova-navigation-clear": require("../../assets/images/navigation/clear.png"),
};

export function NavigationMarkerImages() {
  return <Images images={markerImages} />;
}

export function NavigationLocationPuck({ fix }: { fix?: Fix } = {}) {
  const [motion, setMotion] = useState<LocationMotion>("unknown");
  useEffect(() => {
    let reading: MotionReading | null = null;
    const update = (location: MotionReading) => {
      reading = location;
      setMotion((previous) => getLocationMotion(location, previous, Date.now()));
    };
    // Navigation supplies its own quality-checked fix; browsing uses the SDK feed.
    if (fix) update({ timestamp: fix.timestamp, coords: { accuracy: fix.accuracy ?? undefined, speed: fix.speed ?? undefined, course: fix.heading ?? undefined } });
    else Mapbox.locationManager.addListener(update);
    const timer = setInterval(() => setMotion((previous) => getLocationMotion(reading, previous, Date.now())), 2000);
    return () => { clearInterval(timer); if (!fix) Mapbox.locationManager.removeListener(update); };
  }, [fix]);
  const moving = motion === 'moving';
  // Keep stopped/unknown icons visible on the top layer without deprecated render modes.
  return <LocationPuck
    topImage={moving ? 'rova-navigation-clear' : `rova-navigation-${motion}`}
    shadowImage="rova-navigation-clear" bearingImage={moving ? 'rova-navigation-moving' : 'rova-navigation-clear'}
    puckBearing="course" puckBearingEnabled={moving} scale={1} />;
}
