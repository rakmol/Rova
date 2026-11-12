import{readFileSync}from'node:fs';
const report=JSON.parse(readFileSync(process.argv[2],'utf8')),v=report.metadata?.vulnerabilities;
if(report.error||!v||!['critical','high','moderate','low'].every(k=>Number.isInteger(v[k])&&v[k]>=0))throw Error('Dependency audit is incomplete or the registry failed.');
console.log(JSON.stringify({critical:v.critical,high:v.high,moderate:v.moderate,low:v.low}));
if(v.high||v.critical)process.exitCode=1;
