const version=require('../../release/version.json');
const variants={development:{name:'ROVA Dev',id:'gh.rova.mobile.dev',scheme:'rova-dev'},preview:{name:'ROVA Preview',id:'gh.rova.mobile.preview',scheme:'rova-preview'},production:{name:'ROVA',id:'gh.rova.mobile',scheme:'rova'}};
function buildIdentity(env=process.env){const variant=env.ROVA_APP_VARIANT??'development';if(!Object.hasOwn(variants,variant))throw Error('Unknown ROVA_APP_VARIANT.');if(!/^\d+\.\d+\.\d+$/.test(version.version)||!Number.isSafeInteger(version.minimumAndroidVersionCode)||version.minimumAndroidVersionCode<4)throw Error('Invalid ROVA version metadata.');return{...variants[variant],variant,version:version.version,versionCode:version.minimumAndroidVersionCode};}
module.exports={buildIdentity};
