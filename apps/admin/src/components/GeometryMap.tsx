'use client';
import {useState}from'react';
type Point=[number,number];
function lines(value:unknown):Point[][]{
 if(!Array.isArray(value)||!value.length)return[];
 if(value.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])))return[value.map(p=>[p[0],p[1]]as Point)];
 if(typeof value[0]==='number'&&Number.isFinite(value[0])&&Number.isFinite(value[1]))return[[[value[0],value[1]]]];
 return value.flatMap(lines);
}
export function GeometryMap({geometries}:{geometries:unknown[]}){
 const [zoom,setZoom]=useState(1);const paths=geometries.slice(0,50).flatMap(g=>lines((g as{coordinates?:unknown})?.coordinates));
 const points=paths.flat().slice(0,10000);if(!points.length)return <div className="map empty">No geometry available for this selection.</div>;
 const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
 const scale=Math.min(740/Math.max(.001,maxX-minX),340/Math.max(.001,maxY-minY));const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const xy=(p:Point)=>[400+(p[0]-cx)*scale,200-(p[1]-cy)*scale];
 return <div className="map"><div className="maptools"><button onClick={()=>setZoom(z=>Math.min(8,z*1.5))} aria-label="Zoom geometry in">+</button><button onClick={()=>setZoom(z=>Math.max(1,z/1.5))} aria-label="Zoom geometry out">−</button><span>WGS84 geometry preview · {cy.toFixed(4)}, {cx.toFixed(4)}</span></div>
  <svg role="img" aria-label="Selected road or hazard geometry map" viewBox="0 0 800 400"><rect width="800" height="400" fill="#edf5f4"/>{[1,2,3,4,5,6,7].map(n=><path key={n} d={`M${n*100},0V400 M0,${n*50}H800`} stroke="#d8e5e3"/>)}<g transform={`translate(400 200) scale(${zoom}) translate(-400 -200)`}>{paths.slice(0,100).map((path,i)=>path.length===1?<circle key={i} cx={xy(path[0])[0]} cy={xy(path[0])[1]} r={7/zoom} fill="#bb6600"/>:<path key={i} d={path.slice(0,10000).map((p,j)=>`${j?'L':'M'}${xy(p).join(',')}`).join(' ')} stroke="#087f79" strokeWidth={4/zoom} fill="none"/>)}</g></svg>
  <small>Geometry review only, without a street basemap. OSM candidate geometry: © OpenStreetMap contributors, ODbL. Review full source evidence before approval.</small>
 </div>;
}
