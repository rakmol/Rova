import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {buildApp} from './app.js';
import {readConfig} from './config.js';
import {validateSafetyPack} from '@rova/shared';
const db=(rows:unknown[]=[])=>({query:async()=>({rows}),end:async()=>{},on:()=>{}}) as unknown as Pool;
test('offline safety is opt-in, bounded, complete, versioned and never invents missing verified data',async()=>{
 const app=await buildApp({config:readConfig({NODE_ENV:'test'}),database:db(),logger:false});try{assert.equal((await app.inject('/safety/offline-pack?lon=-.2&lat=5.6&vehicleType=private_car')).statusCode,503);}finally{await app.close();}
 const config=readConfig({NODE_ENV:'test',OFFLINE_SAFETY_ENABLED:'true',OFFLINE_SAFETY_SOURCE_IDS:'10000000-0000-4000-8000-000000000001'});
 const enabled=await buildApp({config,database:db(),logger:false});try{
  assert.equal((await enabled.inject('/safety/offline-pack?lon=-200&lat=5.6&vehicleType=private_car')).statusCode,400);
  const result=await enabled.inject('/safety/offline-pack?lon=-.2&lat=5.6&vehicleType=private_car');assert.equal(result.statusCode,200,result.body);
  const pack=validateSafetyPack(result.json());assert.deepEqual(pack.roads,[]);const{version,...content}=pack;assert.equal(version,'sha256:'+createHash('sha256').update(JSON.stringify(content)).digest('hex'));
 }finally{await enabled.close();}
 for(const rows of [Array.from({length:65},()=>({geometry:[],record:null})),[{geometry:[],record:null}]]){const app=await buildApp({config,database:db(rows),logger:false});try{assert.equal((await app.inject('/safety/offline-pack?lon=-.2&lat=5.6&vehicleType=private_car')).statusCode,503);}finally{await app.close();}}
});
