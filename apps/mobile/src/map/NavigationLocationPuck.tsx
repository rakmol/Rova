import { useEffect, useState } from "react";
import Mapbox, { Images, LocationPuck } from "@rnmapbox/maps";
import { getLocationMotion, type LocationMotion, type MotionReading } from "./locationMotion";

const markerImages = {
  "rova-navigation-moving": require("../../assets/images/navigation/moving.png"),
  "rova-navigation-stationary": require("../../assets/images/navigation/stationary.png"),
  "rova-navigation-unknown": require("../../assets/images/navigation/unknown.png"),
  "rova-navigation-clear": require("../../assets/images/navigation/clear.png"),
};

export function NavigationMarkerImages() {
  return <Images images={markerImages} />;
}

export function NavigationLocationPuck() {
  const [motion, setMotion] = useState<LocationMotion>("unknown");
  useEffect(() => {
    let reading: MotionReading | null = null;
    const update = (location: MotionReading) => {
      reading = location;
      setMotion((previous) => getLocationMotion(location, previous, Date.now()));
    };
    // Reuse the map SDK's location stream; do not create another Expo GPS watcher.
    Mapbox.locationManager.addListener(update);
    const timer = setInterval(() => setMotion((previous) => getLocationMotion(reading, previous, Date.now())), 2000);
    return () => { clearInterval(timer); Mapbox.locationManager.removeListener(update); };
  }, []);
  const moving = motion === 'moving';
  // Keep stopped/unknown icons visible on the top layer without deprecated render modes.
  return <LocationPuck
    topImage={moving ? 'rova-navigation-clear' : `rova-navigation-${motion}`}
    shadowImage="rova-navigation-clear" bearingImage={moving ? 'rova-navigation-moving' : 'rova-navigation-clear'}
    puckBearing="course" puckBearingEnabled={moving} scale={1} />;
}
