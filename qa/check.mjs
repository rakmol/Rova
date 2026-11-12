import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {matrix,validateMatrix,acceptanceBlockers,checkArtifact,candidateFingerprint} from './acceptance.mjs';
const m=matrix(),errors=validateMatrix(m);
if(process.argv.includes('--release')){
 const report=process.argv[process.argv.indexOf('--release')+1],fieldPath=process.argv[process.argv.indexOf('--release')+2];let reportData,field;
 try{reportData=JSON.parse(readFileSync(resolve(report),'utf8'));}catch{}
 try{field=JSON.parse(readFileSync(resolve(fieldPath),'utf8'));}catch{}
 const base=report?dirname(resolve(report)):process.cwd();errors.push(...acceptanceBlockers(m,reportData,field,(p,h)=>checkArtifact(base,p,h)));
 if(reportData?.candidate!==candidateFingerprint())errors.push('Source changed since the automated evidence run.');
 console.log(JSON.stringify({decision:errors.length?'NO_GO':'EVIDENCE_COMPLETE_REQUIRES_RELEASE_OWNER_DECISION',blockers:errors},null,2));
}else console.log(JSON.stringify({traceability:errors.length?'failed':'passed',requirements:m.requirements.length,manualCases:m.manualCases.length,gates:m.gates.length,errors},null,2));
if(errors.length)process.exitCode=1;
