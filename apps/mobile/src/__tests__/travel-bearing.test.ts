import { courseBetween, TravelBearing } from '../navigation/travelBearing';
import type { Fix } from '../navigation/session';
const fix=(lon:number,lat:number,time:number,heading:number|null=90,speed=4):Fix=>({coordinate:[lon,lat],timestamp:time,accuracy:8,heading,speed});
test('north/east/south/west movement produces consistent world bearings',()=>{
  expect(courseBetween([0,0],[0,.001])).toBeCloseTo(0);
  expect(courseBetween([0,0],[.001,0])).toBeCloseTo(90);
  expect(courseBetween([0,0],[0,-.001])).toBeCloseTo(180);
  expect(courseBetween([0,0],[-.001,0])).toBeCloseTo(270);
});
test('measured westward travel overrides contradictory course noise and holds direction when stopped',()=>{
  const direction=new TravelBearing();
  direction.update(fix(0,0,100000),100000);
  expect(direction.update(fix(-.0001,0,102000,90),102000)).toBeCloseTo(270);
  expect(direction.update(fix(-.00011,0,103000,90),103000)).toBeCloseTo(270);
  expect(direction.update(fix(-.00011,0,104000,10,0),104000)).toBeCloseTo(270);
  expect(direction.update({...fix(-.0002,0,105000),accuracy:80},105000)).toBeNull();
  expect(direction.update(fix(-.0002,0,105000),120000)).toBeNull();
});
