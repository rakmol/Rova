import { distance } from '../navigation/session';
import { splitRouteAtProgress } from '../map/routeProgress';
import type { MapLineString } from '../map/types';

const route: MapLineString = { type: 'LineString', coordinates: [[0, 0], [0.001, 0], [0.001, 0.001]] };
const firstLength = distance(route.coordinates[0], route.coordinates[1]);

test('cuts a travelled segment at its exact position, preserving every upcoming turn', () => {
  const parts = splitRouteAtProgress(route, firstLength / 2);
  expect(parts.completed?.coordinates).toEqual([[0, 0], [0.0005, 0]]);
  expect(parts.remaining?.coordinates).toEqual([[0.0005, 0], [0.001, 0], [0.001, 0.001]]);
  expect(route.coordinates).toHaveLength(3);
});

test('a split exactly at a turn shares one endpoint without zero-length extra segments', () => {
  const parts = splitRouteAtProgress(route, firstLength);
  expect(parts.completed?.coordinates).toEqual(route.coordinates.slice(0, 2));
  expect(parts.remaining?.coordinates).toEqual(route.coordinates.slice(1));
});

test('start, unknown progress and a newly calculated route keep the whole route ahead', () => {
  for (const progress of [0, -5, NaN, Infinity]) {
    expect(splitRouteAtProgress(route, progress)).toEqual({ completed: undefined, remaining: route });
  }
  expect(splitRouteAtProgress(route, 10000)).toEqual({ completed: route, remaining: undefined });
  expect(splitRouteAtProgress({ type: 'LineString', coordinates: [] }, 1)).toEqual({ completed: undefined, remaining: undefined });
});

test('repeated vertices are safe and a loop is split by accepted distance rather than nearest coordinate', () => {
  const loop: MapLineString = { type: 'LineString', coordinates: [[0, 0], [0, 0], [0.001, 0], [0, 0], [0, 0.001]] };
  const parts = splitRouteAtProgress(loop, firstLength * 2.5);
  expect(parts.completed?.coordinates.slice(0, 4)).toEqual(loop.coordinates.slice(0, 4));
  expect(parts.remaining?.coordinates[0][0]).toBe(0);
  expect(parts.remaining?.coordinates[0][1]).toBeCloseTo(0.0005);
});
