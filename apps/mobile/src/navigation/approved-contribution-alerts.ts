import {headingDifference,metres,projectOnPath,routeWindow,type RoutingCoordinate} from '@rova/shared';
import type {ApprovedContributionFeed,CommunityMapPin} from '../contributions/mapPins';
import {tx,type MessageKey} from '../i18n';
import type {Fix} from './session';

export type ContributionAlert={id:string;text:string;distanceMeters:number};
function message(pin:CommunityMapPin){
 if(pin.kind==='place')return tx('voice.approvedPlace',{name:pin.name});
 if(pin.kind==='fixed_camera')return tx(pin.category==='fixed_speed'?'voice.approvedSpeedCamera':pin.category==='red_light'?'voice.approvedRedLightCamera':'voice.approvedEquipment');
 return tx('voice.approvedHazard',{hazard:tx(('category.'+pin.category) as MessageKey).toLowerCase()});
}
// Only structured, unambiguous cardinal directions are interpreted. Free text never invents a camera's facing direction.
function directionHeading(value:string):number|undefined{
 return ({north:0,northbound:0,n:0,east:90,eastbound:90,e:90,south:180,southbound:180,s:180,west:270,westbound:270,w:270} as Record<string,number>)[value.trim().toLowerCase()];
}
export class ApprovedContributionAlertEngine{
 private seen=new Set<string>();
 private pending=new Map<string,{timestamp:number;count:number;revision:number}>();
 private announced:{kind:string;category:string;coordinate:RoutingCoordinate}[]=[];
 private lastPrompt=-Infinity;
 update(input:{feed:ApprovedContributionFeed;fix:Fix|null;path:RoutingCoordinate[];progress:number;now:number;navigating:boolean;suppressPrompt:boolean;audioEnabled:boolean}):{nearby:ContributionAlert|null;speak:string|null}{
  const empty={nearby:null,speak:null}, {fix,feed,now}=input;
  if(!input.navigating||!fix||fix.accuracy===null||!Number.isFinite(fix.accuracy)||fix.accuracy<=0||fix.accuracy>25||!Number.isFinite(fix.timestamp)||now-fix.timestamp>3000||fix.timestamp>now+1000||!fix.coordinate.every(Number.isFinite)
   ||fix.heading===null||!Number.isFinite(fix.heading)||fix.heading<0||fix.heading>=360||feed.stale||feed.checkedAt===null||!Number.isFinite(feed.checkedAt)||now-feed.checkedAt>30000||feed.checkedAt>now+1000){this.pending.clear();return empty;}
  const path=routeWindow(input.path,input.progress,80,1000),current=projectOnPath(fix.coordinate,path);
  if(!current||current.ambiguous||current.distance>25||headingDifference(fix.heading,current.heading)>40){this.pending.clear();return empty;}
  const candidates=feed.pins.flatMap(pin=>{
   if(pin.rovaVerified!==true||pin.authorityVerified!==false||pin.evidence!=='community'||!Number.isInteger(pin.revision)||pin.revision<1||!Number.isFinite(Date.parse(pin.expiresAt))||Date.parse(pin.expiresAt)<=now)return [];
   const match=projectOnPath(pin.coordinate,path),direction=directionHeading(pin.direction);
   if(!match||match.ambiguous||match.distance>(pin.kind==='hazard'?150:40)||(direction!==undefined&&headingDifference(direction,match.heading)>40))return [];
   const ahead=match.along-current.along;
   return ahead>=40&&ahead<=600?[{pin,ahead}]:[];
  }).sort((a,b)=>a.ahead-b.ahead);
  const ids=new Set(candidates.map(c=>c.pin.id));for(const id of this.pending.keys())if(!ids.has(id))this.pending.delete(id);
  // A spoken/duplicate pin must not starve other eligible contributions on the same route.
  const candidate=candidates.find(c=>!this.seen.has(c.pin.id)&&!this.announced.some(p=>p.kind===c.pin.kind&&p.category===c.pin.category&&metres(p.coordinate,c.pin.coordinate)<40));
  if(!candidate)return empty;
  const {pin,ahead}=candidate,nearby={id:pin.id,text:message(pin),distanceMeters:Math.round(ahead/10)*10};
  let pending=this.pending.get(pin.id);
  if(!pending||pending.revision!==pin.revision||fix.timestamp-pending.timestamp>3000)pending={timestamp:fix.timestamp,count:1,revision:pin.revision};
  else if(fix.timestamp>pending.timestamp)pending={...pending,timestamp:fix.timestamp,count:pending.count+1};
  this.pending.set(pin.id,pending);
  if(pending.count<2||input.suppressPrompt||now-this.lastPrompt<12000)return{nearby,speak:null};
  this.seen.add(pin.id);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value!);
  if(!input.audioEnabled)return{nearby,speak:null};
  this.announced.push({kind:pin.kind,category:pin.category,coordinate:pin.coordinate});if(this.announced.length>256)this.announced.shift();
  this.lastPrompt=now;
  return{nearby,speak:nearby.text};
 }
}
