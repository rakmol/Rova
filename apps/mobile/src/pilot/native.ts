import{requireOptionalNativeModule}from'expo-modules-core';
export type BuildMeta={version:string;build:string;variant:'development'|'preview'|'production'|'unknown'};
export type ExitCounts=BuildMeta&{supported:boolean;watermark:number;javaCrashes:number;nativeCrashes:number;anrs:number;truncated:boolean};
export const unknownBuild:BuildMeta={version:'unknown',build:'unknown',variant:'unknown'};
export async function androidExitCounts(since:number):Promise<ExitCounts>{
 const module=requireOptionalNativeModule<{readExitCounts:(since:number)=>Promise<ExitCounts>}>('RovaDiagnostics');
 if(!module)return{...unknownBuild,supported:false,watermark:Date.now(),javaCrashes:0,nativeCrashes:0,anrs:0,truncated:false};
 const r=await module.readExitCounts(since);if(typeof r.supported!=='boolean'||typeof r.truncated!=='boolean'||!Number.isFinite(r.watermark)||r.watermark<since||r.watermark>Date.now()+2000||![r.javaCrashes,r.nativeCrashes,r.anrs].every(n=>Number.isInteger(n)&&n>=0&&n<=32)||!/^(\d+\.\d+\.\d+|unknown)$/.test(r.version)||!/^(\d{1,10}|unknown)$/.test(r.build)||!['development','preview','production','unknown'].includes(r.variant))throw Error('Invalid native diagnostic counters.');return r;
}
