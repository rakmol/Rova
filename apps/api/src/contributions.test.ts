import assert from 'node:assert/strict';
import test from 'node:test';
import { contributionBody } from './contributions.js';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import type { Pool } from 'pg';
test('place and equipment proposals accept Ghana points and bounded observations, never authority flags or mobile cameras',()=>{
 const place={kind:'place',name:'TEST ONLY landmark',category:'landmark',lon:-.2,lat:5.6,interaction:'parked'};
 assert.equal(contributionBody.parse(place).kind,'place');
 assert.equal(contributionBody.parse({...place,kind:'fixed_camera',category:'unknown'}).category,'unknown');
 for(const extra of [{authorityVerified:true},{status:'reviewed'},{device_id:'spoofed'},{kind:'fixed_camera'},{category:'mobile_camera'},{interaction:'driver'},{lon:50},{lat:90},{name:'x'},{note:'x'.repeat(501)}])assert.equal(contributionBody.safeParse({...place,...extra}).success,false,JSON.stringify(extra));
});
test('contribution ownership and moderation endpoints require their respective reporting/admin credentials',async()=>{
 const db={end:async()=>{},on:()=>{}} as unknown as Pool;
 const app=await buildApp({config:readConfig({NODE_ENV:'test',ROVA_INCIDENT_MODERATOR_TOKEN:'test-only-moderator-token-at-least-32'}),database:db,logger:false});
 try{
  for(const path of ['/v1/incidents/contributions/mine','/v1/ops/contributions'])assert.equal((await app.inject(path)).statusCode,401);
  for(const path of ['/v1/incidents/contributions','/v1/ops/contributions/review'])assert.equal((await app.inject({method:'POST',url:path,payload:{}})).statusCode,401);
 }finally{await app.close();}
});
