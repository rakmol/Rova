import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { approvedSnapshot, hazardRegion } from './incident-realtime.js';
test('region snapshots bound their SQL lookup and omit expired, unapproved or demo reports',async()=>{
  let sql=''; let params:unknown[]=[];
  const now=Date.now();
  const rows=[{id:'active',status:'verified',expiresAt:new Date(now+10000).toISOString()},
    {id:'expired',status:'verified',expiresAt:new Date(now-1).toISOString()},
    {id:'pending',status:'pending',expiresAt:new Date(now+10000).toISOString()}];
  const db={query:async(s:string,p:unknown[])=>{sql=s;params=p;return{rows};}}as unknown as Pool;
  const snapshot=await approvedSnapshot(db,-.201234,5.612345,(r)=>r);
  assert.deepEqual(snapshot.reports.map(r=>r.id),['active']);assert.deepEqual(params,[-.2,5.62]);
  assert.match(sql,/community_status='verified'/);assert.match(sql,/NOT is_synthetic/);assert.match(sql,/expires_at>clock_timestamp\(\)/);assert.match(sql,/LIMIT 51/);
  assert.deepEqual(snapshot.traffic,{status:'unavailable',measurements:false});
  assert.equal(hazardRegion(-.201,5.612).key,hazardRegion(-.199,5.613).key);
});
