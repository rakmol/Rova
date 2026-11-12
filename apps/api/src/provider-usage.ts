import type {Pool} from 'pg';
import type {ApiConfig} from './config.js';
export type Provider='geoapify'|'mapbox';
export interface UsageLimiter{reserve(provider:Provider,meter:'search'|'routing',count:number):Promise<void>;attempt(provider:Provider):Promise<void>}
export function usageError(statusCode:number,message:string,retryAfter=1){return Object.assign(new Error(message),{statusCode,retryAfter});}
export function postgresUsage(db:Pool,c:ApiConfig):UsageLimiter{
 const limits={searchDay:c.PLACES_DAILY_REQUEST_BUDGET,routingDay:c.ROUTING_DAILY_REQUEST_BUDGET,searchMonth:c.PROVIDER_SEARCH_MONTHLY_LIMIT,routingMonth:c.PROVIDER_ROUTING_MONTHLY_LIMIT,rps:c.PROVIDER_GEOAPIFY_RPS};
 async function transact(provider:Provider,meter:'search'|'routing'|'attempts',count:number){if(!Number.isSafeInteger(count)||count<1)throw usageError(503,'Invalid provider reservation.');
 const client=await db.connect().catch(()=>{throw usageError(503,'Provider usage accounting is unavailable.');});try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[c.PROVIDER_USAGE_SCOPE+':'+provider]);const dates=(await client.query("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date AS day,date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date AS month")).rows[0];
  await client.query('INSERT INTO provider_usage_state(scope,provider,month,limits) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[c.PROVIDER_USAGE_SCOPE,provider,dates.month,JSON.stringify(limits)]);
  const state=(await client.query('SELECT limits FROM provider_usage_state WHERE scope=$1 AND provider=$2 AND month=$3 FOR UPDATE',[c.PROVIDER_USAGE_SCOPE,provider,dates.month])).rows[0];
  if(JSON.stringify(Object.keys(state.limits).sort().map(k=>[k,state.limits[k]]))!==JSON.stringify(Object.keys(limits).sort().map(k=>[k,limits[k as keyof typeof limits]])))throw usageError(503,'Provider limits differ across servers. Contact support.');
  if(meter==='attempts'){
   const rate=provider==='geoapify'?limits.rps:5;
   await client.query("UPDATE provider_usage_state SET recent_calls=ARRAY(SELECT t FROM unnest(recent_calls) t WHERE t>clock_timestamp()-interval '1 second') WHERE scope=$1 AND provider=$2 AND cardinality(recent_calls)>0",[c.PROVIDER_USAGE_SCOPE,provider]);
   const result=await client.query('SELECT coalesce(sum(cardinality(recent_calls)),0)::int AS calls FROM provider_usage_state WHERE scope=$1 AND provider=$2',[c.PROVIDER_USAGE_SCOPE,provider]);
   if(result.rows[0].calls>=rate)throw usageError(429,'Provider request rate reached. Try again shortly.');
   await client.query('UPDATE provider_usage_state SET recent_calls=array_append(recent_calls,clock_timestamp()) WHERE scope=$1 AND provider=$2 AND month=$3',[c.PROVIDER_USAGE_SCOPE,provider,dates.month]);
  }
  for(const period of ['day','month']as const){const date=dates[period];await client.query('INSERT INTO provider_usage(scope,provider,meter,period,starts) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[c.PROVIDER_USAGE_SCOPE,provider,meter,period,date]);const prior=(await client.query('SELECT reserved FROM provider_usage WHERE scope=$1 AND provider=$2 AND meter=$3 AND period=$4 AND starts=$5',[c.PROVIDER_USAGE_SCOPE,provider,meter,period,date])).rows[0];
   const cap=meter==='attempts'?Infinity:meter==='search'?(period==='day'?limits.searchDay:limits.searchMonth):(period==='day'?limits.routingDay:limits.routingMonth);
   if(Number(prior.reserved)+count>cap)throw usageError(429,`Shared ${period} provider request limit reached.`,period==='day'?3600:86400);
   await client.query('UPDATE provider_usage SET reserved=reserved+$6 WHERE scope=$1 AND provider=$2 AND meter=$3 AND period=$4 AND starts=$5',[c.PROVIDER_USAGE_SCOPE,provider,meter,period,date,count]);
  }
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});if((e as{retryAfter?:number}).retryAfter)throw e;throw usageError(503,'Provider usage accounting is unavailable. Cached results may still be used.');}finally{client.release();}}
 return{reserve:(provider,meter,count)=>transact(provider,meter,count),attempt:provider=>transact(provider,'attempts',1)};
}
