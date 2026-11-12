import assert from 'node:assert/strict';
import test from 'node:test';
import {pilotBatch} from './pilot.js';
import {readConfig} from './config.js';
test('pilot collection defaults off and production safety defaults to corridor gating',()=>{assert.equal(readConfig({NODE_ENV:'production',DATABASE_URL:'postgres://local@localhost/rova'}).PILOT_REGION_GATING_ENABLED,'true');assert.equal(readConfig({NODE_ENV:'test'}).PILOT_REGION_GATING_ENABLED,'false');assert.equal(readConfig({NODE_ENV:'test'}).PILOT_TELEMETRY_ENABLED,'false');});
test('diagnostic contract rejects routes, identity, error details, arbitrary metrics and oversized counts',()=>{const b={batchId:'10000000-0000-4000-8000-000000000001',day:'2026-11-12',version:'0.1.0',build:'8',variant:'preview',counts:{sessions:1,nav_attempts:1}};assert.ok(pilotBatch.safeParse(b).success);for(const extra of [{route:[]},{coordinates:[0,0]},{email:'private'},{error:'stack'},{counts:{latitude:1}},{counts:{sessions:10001}},{counts:{sessions:0.5}},{build:'device-id'}])assert.equal(pilotBatch.safeParse({...b,...extra}).success,false);});
