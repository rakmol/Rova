'use client';
import {useState} from 'react';
import {ghanaSpeedRules,type GhanaSpeedContext} from '@rova/shared';
const labels:Record<GhanaSpeedContext,string>={human_activity:'Predominant human activity',built_up:'Urban / built-up',outside_built_up:'Outside built-up area (not motorway)',motorway:'Motorway'};
export function RoadSpeedContext({disabled,apply}:{disabled:boolean;apply:(fields:Record<string,unknown>)=>void}){
 const [category,setCategory]=useState<GhanaSpeedContext>('built_up'),[reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false);
 return <fieldset disabled={disabled}><legend>Regulation 211 road-section classification</legend>
  <p>Official general limits: 30 / 50 / 90 / 100 km/h. These apply after this exact section, direction and signed exceptions have been checked. Publication still requires two independent current reviews.</p>
  <label>Road category<select value={category} onChange={e=>setCategory(e.target.value as GhanaSpeedContext)}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label} — {ghanaSpeedRules.roadLimits[key as GhanaSpeedContext]} km/h</option>)}</select></label>
  <label>Classification and signed-exception evidence<input maxLength={1000} value={reference} onChange={e=>setReference(e.target.value)}/></label>
  <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked this section's boundaries, road category, direction and Road Authority signage; this general default is applicable.</label>
  <button type="button" disabled={!confirmed||reference.trim().length<10} onClick={()=>apply({speed_context:category,speed_context_reference:reference.trim(),default_conditions_confirmed:true})}>Apply classification to draft</button>
  <p>Vehicle caps under regulation 212 are applied separately. <a href={ghanaSpeedRules.roadSource.url} target="_blank" rel="noreferrer">Ghana Police source</a></p>
 </fieldset>;
}
