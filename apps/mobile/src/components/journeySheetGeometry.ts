export type SheetLevel='peek'|'compact'|'expanded';
export function sheetStops(screenHeight:number,fontScale:number,topInset:number,menuHeight:number,footerHeight:number){
 const expanded=Math.max(120,footerHeight+48,Math.min(560,screenHeight-topInset-menuHeight-130));
 const peek=Math.min(expanded,Math.max(80,footerHeight+48));
 const compact=Math.min(expanded,Math.max(peek,screenHeight*(fontScale>=1.5?.42:.32)));
 return {peek,compact,expanded};
}
export function clampSheet(height:number,stops:ReturnType<typeof sheetStops>){return Math.max(stops.peek,Math.min(stops.expanded,height));}
export function settleSheet(start:number,dy:number,velocity:number,stops:ReturnType<typeof sheetStops>):SheetLevel{
 const levels=(['peek','compact','expanded'] as const).filter((level,i,list)=>list.findIndex(key=>stops[key]===stops[level])===i);
 const projected=clampSheet(start-dy-velocity*100,stops);
 let choices=[...levels];
 if(dy>28)choices=choices.filter(level=>stops[level]<start-1);
 else if(dy< -28)choices=choices.filter(level=>stops[level]>start+1);
 if(!choices.length)choices=[...levels];
 return choices.reduce((best,level)=>Math.abs(stops[level]-projected)<Math.abs(stops[best]-projected)?level:best);
}
