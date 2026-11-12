import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,createWriteStream,readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {root,candidateFingerprint} from './acceptance.mjs';
const npm=process.env.npm_execpath;if(!npm||!existsSync(npm))throw new Error('Run this via npm run qa:run.');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=resolve(root,'qa/evidence',stamp);mkdirSync(dir,{recursive:true});
const report={schema:1,candidate:candidateFingerprint(),startedAt:new Date().toISOString(),finishedAt:null,complete:false,fieldTestsExecuted:false,jobs:[],decision:'NO_GO_FIELD_EVIDENCE_REQUIRED'};
const save=()=>writeFileSync(resolve(dir,'automated.json'),JSON.stringify(report,null,2)+'\n');save();
const jobs=[
 {id:'traceability',bin:process.execPath,args:['--test','qa/acceptance.test.mjs']},
 {id:'typecheck',args:['run','typecheck']},
 {id:'mobile-lint',args:['run','lint','--workspace','@rova/mobile']},
 {id:'mobile-tests',args:['run','test','--workspace','@rova/mobile','--','--testTimeout=15000']},
 {id:'api-unit-contract',args:['run','test','--workspace','@rova/api'],unit:true},
 {id:'api-postgis',args:['run','test:db','--workspace','@rova/api'],database:true},
 {id:'admin-browser',args:['run','test:e2e','--workspace','@rova/admin'],browser:true},
 {id:'build',args:['run','build']},
 {id:'android-bundle',cwd:'apps/mobile',args:['exec','--','expo','export','--platform','android','--output-dir',relative(resolve(root,'apps/mobile'),resolve(dir,'android-bundle')),'--max-workers','2']},
 {id:'runtime-probe',bin:process.execPath,args:['qa/probe.mjs']},
];
function dbAllowed(){try{const u=new URL(process.env.TEST_DATABASE_URL);return['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&/^\/rova_test_[a-z0-9_]+$/.test(u.pathname);}catch{return false;}}
for(const job of jobs){const start=Date.now(),artifact=job.id+'.log',target=resolve(dir,artifact);const entry={id:job.id,status:'running',exitCode:null,startedAt:new Date().toISOString(),durationMs:null,artifact,sha256:null};report.jobs.push(entry);save();console.log(`[${job.id}] started`);
 const denied=job.database&&!dbAllowed()?'NOT RUN: set TEST_DATABASE_URL to an explicitly disposable local rova_test_* database.':job.browser&&process.env.ROVA_QA_ALLOW_LOCAL_FIXTURES!=='true'?'NOT RUN: set ROVA_QA_ALLOW_LOCAL_FIXTURES=true to allow the isolated browser fixture database.':null;
 if(denied){writeFileSync(target,denied+'\n');entry.status='not_run';}
 else{const env={...process.env};if(job.unit)delete env.TEST_DATABASE_URL;
  const stream=createWriteStream(target);const result=await new Promise(done=>{const child=spawn(job.bin??process.execPath,job.bin?job.args:[npm,...job.args],{cwd:resolve(root,job.cwd??'.'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},15*60000);child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});child.on('error',()=>{clearTimeout(timer);done({code:null,timedOut:false,error:true});});child.on('close',code=>{clearTimeout(timer);done({code,timedOut,error:false});});});await new Promise(done=>stream.end(done));entry.exitCode=result.code;entry.status=result.code===0&&!result.timedOut&&!result.error?'passed':'failed';if(result.timedOut)entry.note='Timed out. Inspect and stop only this run’s identified fixture processes before retrying.';
 }
 entry.durationMs=Date.now()-start;entry.sha256=createHash('sha256').update(readFileSync(target)).digest('hex');save();console.log(`[${job.id}] ${entry.status}`);
}
report.finishedAt=new Date().toISOString();report.complete=true;if(report.candidate!==candidateFingerprint()){report.complete=false;report.note='Sources changed during the run. Repeat against a fixed candidate.';}save();
console.log(JSON.stringify({evidence:relative(root,resolve(dir,'automated.json')).replaceAll('\\','/'),automatedPassed:report.jobs.filter(j=>j.status==='passed').length,total:jobs.length,fieldTestsExecuted:false,releaseDecision:'NO_GO until independent field/security/monitoring evidence is accepted'},null,2));
if(!report.complete||report.jobs.some(j=>j.status!=='passed'))process.exitCode=1;
