import {cookies}from'next/headers';
import {NextRequest,NextResponse}from'next/server';
const allowed=new Set(['pilot','pilot/corridors','pilot/review','pilot/control','pilot/incident-check','login','session','logout','schema','overview','records','detail','revise','revert','review','publish','withdraw','freshness','analytics','audit','coverage','sponsored','provider-costs','members','member']);
const readOnly=new Set(['pilot','session','schema','overview','records','detail','freshness','analytics','audit','coverage','sponsored','provider-costs','members']);
const base=process.env.ROVA_API_URL??'http://127.0.0.1:4000';
async function handle(request:NextRequest,context:{params:Promise<{path:string[]}>}){
 const params=await context.params;const path=params.path.join('/');if(!allowed.has(path))return NextResponse.json({error:'Unknown endpoint'},{status:404});
 if((request.method==='GET')!==readOnly.has(path))return NextResponse.json({error:'Method not allowed'},{status:405});
 if(request.method==='POST'&&(request.headers.get('origin')!==request.nextUrl.origin||request.headers.get('x-rova-ops')!=='1'))return NextResponse.json({error:'Same-origin request required'},{status:403});
 const api=new URL(base);if(api.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(api.hostname))return NextResponse.json({error:'Secure API endpoint required'},{status:503});
 const jar=await cookies();let body:Record<string,unknown>|undefined;
 if(request.method==='POST'){
  const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>524288){await reader.cancel();return NextResponse.json({error:'Request too large'},{status:413});}chunks.push(part.value);}}
  try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!body||Array.isArray(body)||typeof body!=='object')throw new Error();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
 }
 try{
  const token=jar.get('rova_ops_access')?.value;
  const upstream=await fetch(`${base.replace(/\/$/,'')}/v1/ops/${path}${request.nextUrl.search}`,{method:request.method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await upstream.json();
  const response=NextResponse.json((path==='login')&&upstream.ok?{role:data.role,aal:data.aal,expiresAt:data.expiresAt}:data,{status:upstream.status});
  response.headers.set('Cache-Control','no-store');
  if((path==='login')&&upstream.ok){
   const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/api/ops',maxAge:Math.max(0,Math.min(14400,Math.floor((data.expiresAt-Date.now())/1000)))};
   response.cookies.set('rova_ops_access',data.accessToken,options);response.cookies.set('rova_ops_refresh','',{path:'/api/ops',maxAge:0});
  }
  if(path==='logout'||upstream.status===401){response.cookies.set('rova_ops_access','',{path:'/api/ops',maxAge:0});response.cookies.set('rova_ops_refresh','',{path:'/api/ops',maxAge:0});}
  return response;
 }catch{
  const response=NextResponse.json({error:path==='logout'?'Signed out on this browser; server revocation could not be confirmed.':'ROVA API is unavailable.'},{status:path==='logout'?200:503});
  if(path==='logout'){response.cookies.set('rova_ops_access','',{path:'/api/ops',maxAge:0});response.cookies.set('rova_ops_refresh','',{path:'/api/ops',maxAge:0});}return response;
 }
}
export const GET=handle;export const POST=handle;
