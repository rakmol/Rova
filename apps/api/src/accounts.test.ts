import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseProvider,accountPlace,driverPreferences}from'./accounts.js';
import {buildApp}from'./app.js';
import {readConfig}from'./config.js';
import type{Pool}from'pg';
test('unconfigured optional auth fails closed while guest navigation remains available',async()=>{
  assert.equal(supabaseProvider({}),undefined);
  const db={end:async()=>{},on:()=>{}}as unknown as Pool;const app=await buildApp({config:readConfig({NODE_ENV:'test'}),database:db,logger:false});
  try{const r=await app.inject('/v1/auth/status');assert.equal(r.statusCode,200);assert.deepEqual(r.json(),{enabled:false,guestNavigation:true,provider:null});assert.equal((await app.inject({method:'POST',url:'/v1/auth/code',payload:{email:'driver@example.com'}})).statusCode,503);assert.equal((await app.inject('/health')).statusCode,200);}finally{await app.close();}
});
test('driver write schemas cannot accept privileges, histories or invalid coordinates',()=>{
  const p={clientKey:'home',kind:'home',label:'Home',address:'',attribution:'User selected',lon:-.2,lat:5.6};
  assert.ok(accountPlace.safeParse(p).success);assert.equal(accountPlace.safeParse({...p,admin:true}).success,false);assert.equal(accountPlace.safeParse({...p,lon:181}).success,false);
  assert.equal(driverPreferences.safeParse({voiceEnabled:true,voiceLanguage:'en-GH',units:'metric',routes:[]}).success,false);
  assert.throws(()=>readConfig({SUPABASE_URL:'http://untrusted.example'}));
});
