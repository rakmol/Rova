import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const raw=JSON.parse(readFileSync(process.env.BUILD_RESULT,'utf8')),build=Array.isArray(raw)?raw[0]:raw;
if(!build?.id||build.status!=='FINISHED'||!build.artifacts?.buildUrl)throw Error('No completed Android build artifact.');
const version=JSON.parse(readFileSync('release/version.json','utf8'));
if(build.appVersion!==version.version||!Number.isSafeInteger(Number(build.appBuildVersion))||Number(build.appBuildVersion)<version.minimumAndroidVersionCode)throw Error('Build version does not meet the reviewed release metadata.');
if(!process.env.GITHUB_SHA||build.gitCommitHash!==process.env.GITHUB_SHA)throw Error('Build commit does not match the reviewed CI commit.');
const url=new URL(build.artifacts.buildUrl);if(url.protocol!=='https:')throw Error('Build artifact must use HTTPS.');
const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body)throw Error('Could not hash completed build.');const hash=createHash('sha256');for await(const bytes of response.body)hash.update(bytes);
const manifest={schema:1,sourceCommit:process.env.GITHUB_SHA,profile:process.env.BUILD_PROFILE,buildId:build.id,appVersion:build.appVersion,versionCode:build.appBuildVersion,artifactSha256:hash.digest('hex'),node:process.version,npm:'11.6.2',easCli:'27.7.2',image:'ubuntu-26.04-jdk-17-ndk-r27b-sdk-58',createdAt:new Date().toISOString(),fieldTested:false,playPublished:false};
// Signed download URLs and private remote build output are deliberately omitted.
writeFileSync('android-build-manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log('Build manifest saved; no publication performed.');
