import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {readConfig} from './config.js';
import {encryptPushToken,decryptPushToken,pushPreferencesSchema} from './notifications.js';
import {expoPushTransport,runNotificationWorker} from './notification-worker.js';
test('notification opt-ins are strict, cannot target trips or marketing, and encrypt tokens with authentication',()=>{
 const b={enabled:false,closures:false,policy:false,marketing:false,currentTrip:false,timeZone:'Africa/Accra',dailyCap:2,permission:'unknown',regions:[]};assert.ok(pushPreferencesSchema.safeParse(b).success);
 for(const extra of [{marketing:true},{currentTrip:true},{documentNumber:'private'},{dailyCap:3},{regions:Array(6).fill({})}])assert.equal(pushPreferencesSchema.safeParse({...b,...extra}).success,false);
 const key='ab'.repeat(32),token='ExponentPushToken[isolated_test_token_1234]',cipher=encryptPushToken(token,key);assert.ok(!cipher.includes(Buffer.from(token)));assert.equal(decryptPushToken(cipher,key),token);cipher[12]^=1;assert.throws(()=>decryptPushToken(cipher,key));
});
test('push delivery stays disabled; transport distinguishes retryable rejection, ambiguous outcomes and receipts',async()=>{
 assert.deepEqual(await runNotificationWorker({query:async()=>{throw new Error('must not query');}}as unknown as Pool,readConfig({NODE_ENV:'test'})),{disabled:true});
 const transport=(response:Response)=>expoPushTransport('test_private_token',async()=>response);
 assert.deepEqual(await transport(new Response('',{status:429})).send('secret','closure','id'),{kind:'retry',reason:'provider_rate_limit'});
 assert.equal((await transport(new Response('',{status:503})).send('secret','policy','id')).kind,'unknown');
 assert.equal((await expoPushTransport('test',async()=>{throw new Error('timeout');}).send('secret','policy','id')).kind,'unknown');
 assert.equal((await transport(Response.json({data:[{status:'error',details:{error:'DeviceNotRegistered'}}]})).send('secret','policy','id')).kind,'invalid');
 const received:unknown[]=[];const fake=expoPushTransport('test',async(_url,options)=>{received.push(JSON.parse(String(options?.body)));return Response.json({data:[{status:'ok',id:'ticket-test'}]});});assert.equal((await fake.send('secret','closure','test')).kind,'accepted');const body=received[0]as Record<string,unknown>[];assert.equal(body[0].sound,null);assert.ok(!JSON.stringify(body).includes('coordinate'));
});
