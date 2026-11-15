import type {FastifyInstance} from 'fastify';
import {ghanaRulesCurrent,ghanaSpeedRules} from '@rova/shared';
export function registerGhanaRules(app:FastifyInstance,clock=Date.now){
 app.get('/safety/ghana-rules',async()=>({status:ghanaRulesCurrent(clock())?'document_verified':'review_due',...ghanaSpeedRules,
  applicability:'General statutory reference, not a GPS-specific limit. Road Authority signs, vehicle class and reviewed road-section applicability must be checked.',
  currentLocationLimit:null,enforcementLocations:[],cameraCoverage:'not_established_by_speed_rules'}));
}
