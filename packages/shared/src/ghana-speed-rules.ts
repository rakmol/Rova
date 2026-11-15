import type {VehicleClass} from './index';

// Verified document facts, not proof that a particular GPS position belongs to a category.
export const ghanaSpeedRules={
 version:'gh-li2519-211-212-2026-11-15',checkedAt:'2026-11-15T00:00:00Z',reviewBy:'2027-05-14T00:00:00Z',
 roadSource:{authority:'Ghana Police Service',reference:'TraffiTech-GH FAQ 5.2; L.I. 2519 regulation 211',url:'https://police.gov.gh/en/index.php/traffitech-gh/'},
 vehicleSource:{authority:'Road Traffic Regulations, 2026 (L.I. 2519)',reference:'Regulation 212(1)(a)-(e)',url:'https://superlawgh.com/road-traffic-regulations-li-2519/',publication:'Public legislative reproduction; not an official publisher'},
 supportingVehicleSource:{authority:'DVLA, Ghana',url:'https://www.transaid.org/wp-content/uploads/2025/03/Ghana-HGV-Standardised-Instructors-Manual.pdf',reference:'Speed limits for particular classes; corroborating guidance under the earlier numbering'},
 roadLimits:{human_activity:30,built_up:50,outside_built_up:90,motorway:100},
 vehicleCaps:{private_car:100,light_vehicle:100,taxi:80,bus:80,passenger_for_reward:80,loaded_heavy_vehicle:75,unloaded_heavy_vehicle:80,agricultural_vehicle:30},
} as const;
export type GhanaSpeedContext=keyof typeof ghanaSpeedRules.roadLimits;
export function ghanaRulesCurrent(now:number){return Number.isFinite(now)&&now>=Date.parse(ghanaSpeedRules.checkedAt)-2000&&now<Date.parse(ghanaSpeedRules.reviewBy);}
export function statutoryVehicleCap(vehicle:VehicleClass){
 if(vehicle==='motorcycle')return {known:true as const,speedLimitKmh:null,reference:'212(1)(e): general road limit for other motor vehicles; no invented motorcycle cap'};
 if(vehicle==='commercial_vehicle'||vehicle==='heavy_vehicle')return {known:false as const,speedLimitKmh:null,reference:'Choose the specific vehicle use/load before a numeric vehicle limit can be established.'};
 return {known:true as const,speedLimitKmh:ghanaSpeedRules.vehicleCaps[vehicle],reference:ghanaSpeedRules.vehicleSource.reference};
}
export const selectableVehicleClasses=['private_car','motorcycle','taxi','bus','passenger_for_reward','light_vehicle','loaded_heavy_vehicle','unloaded_heavy_vehicle','agricultural_vehicle'] as const satisfies readonly VehicleClass[];
export function vehicleRuleApplies(ruleClass:string,vehicle:VehicleClass){return ruleClass==='all'||ruleClass===vehicle||(ruleClass==='heavy_vehicle'&&['loaded_heavy_vehicle','unloaded_heavy_vehicle'].includes(vehicle));}
