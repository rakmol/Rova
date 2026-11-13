import { distance } from '../navigation/session';
import type { MapCoordinate, MapLineString } from './types';

// Use the session's accepted along-route distance, not a second GPS projection.
// This keeps crossings/parallel roads and uncertain GPS under its existing checks.
export function splitRouteAtProgress(route: MapLineString, along: number) {
  const points = route.coordinates;
  const line = (coordinates: MapCoordinate[]): MapLineString | undefined =>
    coordinates.length >= 2 ? { type: 'LineString', coordinates } : undefined;
  if (points.length < 2) return { completed: undefined, remaining: undefined };
  if (!Number.isFinite(along) || along <= 0) return { completed: undefined, remaining: route };
  let covered = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = distance(a, b);
    if (length > 0 && covered + length >= along) {
      const fraction = (along - covered) / length;
      if (fraction >= 1) return { completed: line(points.slice(0, i + 1)), remaining: line(points.slice(i)) };
      if (fraction <= 0) return { completed: line(points.slice(0, i)), remaining: line(points.slice(i - 1)) };
      const seam: MapCoordinate = [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
      return { completed: line([...points.slice(0, i), seam]), remaining: line([seam, ...points.slice(i)]) };
    }
    covered += length;
  }
  return { completed: route, remaining: undefined };
}
