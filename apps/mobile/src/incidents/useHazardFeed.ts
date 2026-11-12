import {useNetwork} from "../offline/network";
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { HazardFeed, selectHazardRegion, type HazardFeedState } from './realtime';
import { hazardTransport } from './stream';

const empty: HazardFeedState = { reports: [], checkedAt: null, stale: true, transport: 'connecting', truncated: false };
export function useHazardFeed(coordinate: [number, number] | undefined) {
  const network=useNetwork();
  const allowed=network.status!=='offline'&&!network.lowData;
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [state, setState] = useState(empty);
  const active = useRef<{ feed: HazardFeed; center: [number, number] } | null>(null);
  const lon = coordinate?.[0], lat = coordinate?.[1];
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') { active.current?.feed.stop(); active.current = null; }
      setForeground(s === 'active');
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!allowed || !foreground || lon === undefined || lat === undefined || lon < -4 || lon > 2 || lat < 4 || lat > 12 || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      active.current?.feed.stop(); active.current = null; return;
    }
    const center = selectHazardRegion(active.current?.center, [lon, lat]);
    if (!active.current || active.current.center !== center) {
      active.current?.feed.stop();
      const feed = new HazardFeed(hazardTransport(...center), setState, [lon, lat]);
      active.current = { feed, center }; feed.start();
    } else active.current.feed.setCoordinate([lon, lat]);
  }, [lon, lat, foreground,allowed]);
  useEffect(() => () => { active.current?.feed.stop(); active.current = null; }, []);
  return allowed && foreground && lon !== undefined && lat !== undefined ? state : empty;
}
