import assert from 'node:assert/strict';
import test from 'node:test';
import {estimateProviderCosts,planningAlert} from '@rova/shared';
import {providerCostSnapshot} from './provider-costs.js';
import {readConfig} from './config.js';
test('cost dashboard never fabricates account usage, monthly enforcement, delivered alerts or secret values',()=>{const c=readConfig({NODE_ENV:'test',GEOAPIFY_API_KEY:'private-audit-key',SUPABASE_SECRET_KEY:'private-server-key-123456789'}),value=providerCostSnapshot(c,new Date('2028-02-01T00:00:00Z'));assert.equal(value.days,29);assert.equal(value.actualSpendUsd,null);assert.equal(value.actualUsage,null);assert.deepEqual(value.monthlyQuota,{search:31000,routing:9300});assert.equal(value.monthlyEnforcement,'database_shared');assert.equal(value.alertDelivery,'not_configured');assert.equal(value.providers[1].currentDailyCap,300);assert.ok(!JSON.stringify(value).includes('private-'));});
test('planning uses credit/call and MAU units, handles thresholds, rejects invalid inputs and refuses an out-of-plan quote',()=>{
 const s={searchRequests:1000,routeCalculations:100,mapMaus:26000,peakDailyCredits:100,geoPlan:'free' as const,monthlyBudgetUsd:5};const value=estimateProviderCosts(s,30);assert.equal(value.baselineGeoCredits,1300);assert.equal(value.partialEstimateUsd,4);assert.equal(value.budgetAlert,'warning');assert.equal(value.applied,false);
 assert.equal(estimateProviderCosts({...s,peakDailyCredits:3001},30).partialEstimateUsd,null);assert.equal(estimateProviderCosts({...s,mapMaus:1250001},30).partialEstimateUsd,null);assert.equal(estimateProviderCosts({...s,geoPlan:'api10',mapMaus:0},30).partialEstimateUsd,59);
 assert.equal(estimateProviderCosts({...s,searchRequests:100000},30).outsideGeoPlan,true);assert.equal(planningAlert(null,1),'unknown');assert.equal(planningAlert(1,null),'unknown');assert.equal(planningAlert(1,0),'exceeded');assert.equal(planningAlert(0,0),'normal');assert.equal(planningAlert(95,100),'critical');assert.equal(planningAlert(100,100),'exceeded');
 for(const change of [{routeCalculations:-1},{mapMaus:NaN},{searchRequests:1.5}])assert.throws(()=>estimateProviderCosts({...s,...change},30));
});
