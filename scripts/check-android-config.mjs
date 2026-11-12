import{resolve}from'node:path';
import{spawnSync}from'node:child_process';import{readFileSync,existsSync}from'node:fs';
const eas=JSON.parse(readFileSync('apps/mobile/eas.json','utf8'));
for(const [profile,id]of [['development','gh.rova.mobile.dev'],['preview','gh.rova.mobile.preview'],['production','gh.rova.mobile']]){
 const r=spawnSync(process.execPath,[resolve('node_modules/expo/bin/cli'),'config','--type','public','--json'],{cwd:'apps/mobile',env:{...process.env,EXPO_NO_DOTENV:'1',ROVA_APP_VARIANT:profile},encoding:'utf8',maxBuffer:4*1024*1024});
 // Resolve the workspace-installed CLI through the root, not a second installation.
 if(r.status!==0)throw Error('Expo public config failed for '+profile+'.');
 const c=JSON.parse(r.stdout);if(c.android.package!==id||!c.version||!existsSync('apps/mobile/'+c.icon)||!existsSync('apps/mobile/'+c.android.adaptiveIcon.foregroundImage))throw Error('Invalid Android identity/assets for '+profile+'.');
 if(eas.build[profile].android.buildType!==(profile==='production'?'app-bundle':'apk'))throw Error('Incorrect Android artifact type.');
 console.log(`${profile}: ${id}, ${c.version}, icon/adaptive assets valid.`);
}

for(const profile of ['preview','production'])if(eas.build[profile].env.EXPO_PUBLIC_PILOT_MODE!=='true')throw Error('Pilot offline safety must remain disabled.');
const autolink=spawnSync(process.execPath,[resolve('node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js'),'resolve','--platform','android','--json'],{cwd:'apps/mobile',encoding:'utf8',maxBuffer:4*1024*1024});if(autolink.status!==0||!autolink.stdout.includes('gh.rova.diagnostics.RovaDiagnosticsModule'))throw Error('Local pilot diagnostic module missing from Android autolinking.');console.log('Local diagnostic module autolinks; compilation/device acceptance still required.');
