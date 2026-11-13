import { distance, type Fix } from './session';

export function courseBetween(a: Fix['coordinate'], b: Fix['coordinate']) {
  const rad = (v: number) => v * Math.PI / 180;
  const delta = rad(b[0] - a[0]), aLat = rad(a[1]), bLat = rad(b[1]);
  return (Math.atan2(Math.sin(delta) * Math.cos(bLat), Math.cos(aLat) * Math.sin(bLat) - Math.sin(aLat) * Math.cos(bLat) * Math.cos(delta)) * 180 / Math.PI + 360) % 360;
}

// Display orientation only; safety matching continues to use the original GPS fix.
export class TravelBearing {
  private anchor: Fix | null = null;
  private lastTimestamp = -Infinity;
  private bearing: number | null = null;
  private measured = false;
  update(fix: Fix | null, now: number): number | null {
    if (!fix || fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 35 || !Number.isFinite(fix.timestamp) || now - fix.timestamp > 10000 || fix.timestamp > now + 2000) return null;
    if (fix.timestamp <= this.lastTimestamp) return this.bearing;
    this.lastTimestamp = fix.timestamp;
    if (fix.speed !== null && fix.speed >= 0 && fix.speed < 0.8) { this.anchor = fix; return this.bearing; }
    const elapsed = this.anchor ? (fix.timestamp - this.anchor.timestamp) / 1000 : 0;
    const moved = this.anchor ? distance(this.anchor.coordinate, fix.coordinate) : 0;
    if (this.anchor && elapsed > 0 && elapsed <= 10 && moved >= Math.max(5, Math.min(12, fix.accuracy * 0.75)) && moved <= elapsed * 60 + 70) {
      this.bearing = courseBetween(this.anchor.coordinate, fix.coordinate);
      this.measured = true;
      this.anchor = fix;
    } else {
      if ((!this.measured || elapsed > 10) && fix.heading !== null && Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360 && fix.speed !== null && fix.speed >= 0.8 && fix.speed <= 60) this.bearing = fix.heading;
      if (!this.anchor || elapsed > 10) this.anchor = fix;
    }
    return this.bearing;
  }
}
