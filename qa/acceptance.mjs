import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,realpathSync,statSync,openSync,readSync,closeSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
export const matrixPath=resolve(root,'qa/matrix.json');
export const matrix=()=>JSON.parse(readFileSync(matrixPath,'utf8'));
export function within(base,path){const target=resolve(base,path),r=relative(base,target);if(r.startsWith('..'+sep)||r==='..'||isAbsolute(r))throw new Error('Evidence path escapes its directory.');return target;}
export function validateMatrix(m){
 const errors=[],unique=(items,key)=>new Set(items.map(i=>i[key])).size===items.length;
 if(m.schema!==1||!unique(m.requirements,'id')||!unique(m.manualCases,'id')||!unique(m.gates,'id'))errors.push('Schema or duplicate trace IDs.');
 const manual=new Set(m.manualCases.map(c=>c.id)),requirements=new Set(m.requirements.map(r=>r.id));
 for(const r of m.requirements){if(!r.requirement||!r.automated.length||!r.manual.length)errors.push(`${r.id}: missing coverage mapping.`);for(const file of r.automated){try{if(!statSync(within(root,file)).isFile())throw new Error();}catch{errors.push(`${r.id}: missing test ${file}`);}}for(const id of r.manual)if(!manual.has(id))errors.push(`${r.id}: unknown manual case ${id}`);}
 for(const c of m.manualCases)if(!c.steps.length||!c.expected.length||!c.evidence.length||!['bench','device','road','operations','review'].includes(c.environment))errors.push(`${c.id}: incomplete manual protocol.`);
 for(const g of m.gates){if(!g.requirements.length||!g.manual.length)errors.push(`${g.id}: gate lacks traceability.`);for(const id of g.requirements)if(!requirements.has(id))errors.push(`${g.id}: unknown requirement ${id}`);for(const id of g.manual)if(!manual.has(id))errors.push(`${g.id}: unknown case ${id}`);}
 return errors;
}
export function candidateFingerprint(base=root){const files=[];const walk=(dir,all=false)=>{if(!existsSync(dir))return;for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.isSymbolicLink())continue;const p=resolve(dir,entry.name);if(entry.isDirectory()){if(p!==resolve(base,'qa/evidence'))walk(p,all);}else if((all||/\.(?:ts|tsx|js|mjs|cjs|json|sql|yml|yaml)$/.test(entry.name))&&!entry.name.startsWith('.env'))files.push(p);}};
 for(const dir of ['apps/api/src','apps/api/db/init','apps/admin/src','apps/admin/e2e','apps/mobile/src','apps/mobile/scripts','packages/shared/src','packages/ui/src','qa','scripts','.github','release'])walk(resolve(base,dir));
 walk(resolve(base,'apps/mobile/assets'),true);
 // Generated evidence, including bundles/test logs, never changes source identity.
 const selected=files.filter(p=>!relative(base,p).replaceAll('\\','/').startsWith('qa/evidence/'));
 for(const folder of ['.','apps/api','apps/admin','apps/mobile','packages/shared','packages/ui'])for(const name of readdirSync(resolve(base,folder))){const p=resolve(base,folder,name);if(statSync(p).isFile()&&/\.(?:json|js|cjs|mjs|ts)$/.test(name)&&!['next-env.d.ts'].includes(name)&&!name.startsWith('.env'))selected.push(p);}
 for(const p of ['.gitattributes','.gitignore','.easignore','.npmrc','.nvmrc','.gitleaks.toml','apps/mobile/.gitignore','apps/mobile/.easignore'])if(existsSync(resolve(base,p)))selected.push(resolve(base,p));
 const hash=createHash('sha256');for(const p of [...new Set(selected)].sort()){hash.update(relative(base,p).replaceAll('\\','/')+'\0');hash.update(readFileSync(p));hash.update('\0');}return hash.digest('hex');
}
const requiredJobs=['traceability','typecheck','mobile-lint','mobile-tests','api-unit-contract','api-postgis','admin-browser','build','android-bundle','runtime-probe'];
export function acceptanceBlockers(m,automated,field,artifactCheck=()=>false,now=Date.now()){
 const blockers=validateMatrix(m);if(!automated||automated.schema!==1){blockers.push('No current automated evidence.');return blockers;}
 if(!/^[a-f0-9]{64}$/.test(automated.candidate??''))blockers.push('Invalid source identity.');
 if(automated.complete!==true)blockers.push('Automated run is incomplete.');
 if(!Number.isFinite(Date.parse(automated.finishedAt))||Date.parse(automated.finishedAt)>now||now-Date.parse(automated.finishedAt)>7*86400000)blockers.push('Automated evidence must be current (at most seven days old).');
 for(const name of requiredJobs){const entries=automated.jobs?.filter(j=>j.id===name)??[];if(entries.length!==1||entries[0].status!=='passed'||entries[0].exitCode!==0||!entries[0].artifact||!artifactCheck(entries[0].artifact,entries[0].sha256))blockers.push(`Automated job lacks passing hashed evidence: ${name}`);}
 if(!field||field.schema!==1||field.candidate!==automated.candidate){blockers.push('Missing field evidence for this exact source identity.');return blockers;}
 if(!/^[a-f0-9]{64}$/.test(field.apkSha256??'')||!field.apkArtifact||!artifactCheck(field.apkArtifact,field.apkSha256))blockers.push('Exact tested APK and its SHA256 are required.');
 if(!field.buildId||!['preview','production'].includes(field.buildProfile))blockers.push('Production acceptance requires an identified standalone release/preview APK, not a development client.');
 if(!Array.isArray(field.devices)||field.devices.length<3||new Set(field.devices?.map(d=>d.id)).size!==field.devices?.length||field.devices.some(d=>!d.id||!d.model||!d.android||!Number.isFinite(d.ramGb)||d.ramGb<=0||d.physical!==true||!Number.isInteger(d.manifestMinSdk)||d.manifestMinSdk<1))blockers.push('Three identified physical Android devices and APK minimum SDK evidence required.');
 const records=field.cases??[];
 for(const c of m.manualCases){const entries=records.filter(r=>r.id===c.id),r=entries[0];if(entries.length!==1||r.status!=='passed'||!r.tester||!r.reviewer||r.tester===r.reviewer||!r.observations||!Number.isFinite(Date.parse(r.executedAt))||Date.parse(r.executedAt)>now||now-Date.parse(r.executedAt)>30*86400000||!r.artifacts?.length||r.artifacts.some(a=>!artifactCheck(a.path,a.sha256))||(['device','road'].includes(c.environment)&&(!r.deviceIds?.length||r.deviceIds.some(id=>!field.devices?.some(d=>d.id===id)))))blockers.push(`Manual evidence incomplete: ${c.id}`);}
 const open=field.defects?.filter(d=>d.status!=='closed'&&['critical','high'].includes(d.severity))??[];if(open.length)blockers.push('Unresolved critical/high defects.');
 for(const role of ['safety','security-privacy','operations','product']){const sign=field.signoffs?.find(s=>s.role===role);if(!sign?.reviewer||!sign.artifact||!artifactCheck(sign.artifact,sign.sha256)||!sign.acceptedAt||!Number.isFinite(Date.parse(sign.acceptedAt))||Date.parse(sign.acceptedAt)>now)blockers.push(`Missing independently recorded ${role} acceptance.`);}
 if(field.localizationReviewed!==true)blockers.push('Human copy/pronunciation review is pending.');
 if(field.productionMonitoringVerified!==true)blockers.push('Production monitoring and alert drills are not evidenced.');
 return blockers;
}
export function checkArtifact(evidenceRoot,path,expected){let fd;try{if(!/^[a-f0-9]{64}$/.test(expected??''))return false;const p=within(evidenceRoot,path);const actual=realpathSync(p);within(realpathSync(evidenceRoot),relative(realpathSync(evidenceRoot),actual));if(!statSync(p).isFile())return false;fd=openSync(p,'r');const hash=createHash('sha256'),buffer=Buffer.alloc(1048576);let size;while((size=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,size));return hash.digest('hex')===expected;}catch{return false;}finally{if(fd!==undefined)closeSync(fd);}}
export const automationJobs=requiredJobs;
