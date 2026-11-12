export const PROVIDER_COST_REVIEW_DATE='2026-11-11';
export type CostScenario={searchRequests:number;routeCalculations:number;mapMaus:number;peakDailyCredits:number;geoPlan:'free'|'api10';monthlyBudgetUsd:number|null};
export function planningAlert(usage:number|null,limit:number|null){if(usage===null||limit===null)return'unknown' as const;if(limit===0)return usage>0?'exceeded' as const:'normal' as const;const ratio=usage/limit;return ratio>=1?'exceeded' as const:ratio>=.95?'critical' as const:ratio>=.8?'warning' as const:'normal' as const;}
export function estimateProviderCosts(s:CostScenario,days:number){
 if(!Number.isInteger(days)||days<28||days>31||![s.searchRequests,s.routeCalculations,s.mapMaus,s.peakDailyCredits].every(v=>Number.isInteger(v)&&v>=0&&v<=10000000)||!['free','api10'].includes(s.geoPlan)||(s.monthlyBudgetUsd!==null&&(!Number.isFinite(s.monthlyBudgetUsd)||s.monthlyBudgetUsd<0||s.monthlyBudgetUsd>1000000)))throw new Error('Use nonnegative counts up to10 million and a valid USD budget.');
 const geoDaily=s.geoPlan==='free'?3000:10000,geoBase=s.geoPlan==='free'?0:59,baselineGeoCredits=s.searchRequests+3*s.routeCalculations;
 const outsideGeoPlan=s.peakDailyCredits>geoDaily||baselineGeoCredits>geoDaily*days;
 const mapIllustrationUsd=s.mapMaus>1250000?null:(Math.max(0,Math.min(s.mapMaus,125000)-25000)*4+Math.max(0,Math.min(s.mapMaus,250000)-125000)*3.2+Math.max(0,s.mapMaus-250000)*2.4)/1000;
 const partialEstimateUsd=outsideGeoPlan||mapIllustrationUsd===null?null:Math.round((geoBase+mapIllustrationUsd)*100)/100;
 return{simulation:true,applied:false,days,baselineGeoCredits,geoDaily,referenceDailyAllowanceSum:geoDaily*days,outsideGeoPlan,mapIllustrationUsd,partialEstimateUsd,budgetAlert:planningAlert(partialEstimateUsd,s.monthlyBudgetUsd),dailyAlert:planningAlert(s.peakDailyCredits,geoDaily),limitations:'Planning only: three two-waypoint <=500km route preference calls assumed per calculation. Daily credits do not roll over. Long routes, other APIs, retries, fallback geocoding, native Navigation SDK, Supabase, hosting/builds, tax and FX are excluded. Account contracts and actual billing are not connected.'};
}
