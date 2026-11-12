import{resolve}from'node:path';import{fileURLToPath}from'node:url';
import{execFileSync}from'node:child_process';import{existsSync}from'node:fs';
export function forbidden(path){const p=path.replaceAll('\\','/').toLowerCase();return /(^|\/)\.env(?:\..*)?$/.test(p)&&!p.endsWith('/.env.example')&&p!=='.env.example'||/(^|\/)(credentials(?:\.[^/]+)?\.json|google-services\.json|\.netrc|keystore\.properties|key\.properties|[^/]*service-account[^/]*\.json|[^/]*firebase-adminsdk[^/]*\.json)$|\.(?:jks|keystore|p8|p12|pfx|pem|key|mobileprovision|apk|aab|apks)$/.test(p)||/(^|\/)(node_modules|\.vercel|\.claude|\.vscode|\.git|\.next|\.next-e2e|\.expo|test-results|playwright-report)\//.test(p)||/^(?:qa\/evidence|audit)\//.test(p)||p!=='package-lock.json'&&p.endsWith('/package-lock.json');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let files;try{files=execFileSync('git',['ls-files','--stage','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);}catch{console.error('Run repository hygiene from a full monorepo Git checkout.');process.exit(1);}
 const bad=files.filter(line=>line.startsWith('160000 ')||forbidden(line.slice(line.indexOf('\t')+1)));
 if(bad.length){console.error('Forbidden tracked credentials/generated files or nested Git links:',bad.map(line=>line.slice(line.indexOf('\t')+1)).join(', '));process.exitCode=1;}
 for(const p of ['apps/api/src/app.ts','apps/mobile/app.config.ts','apps/admin/package.json','package-lock.json'])if(!existsSync(p)){console.error('Incomplete monorepo: '+p);process.exitCode=1;}
 if(!process.exitCode)console.log('Tracked paths contain no prohibited credential files, nested Git links or secondary lockfiles.');
}
