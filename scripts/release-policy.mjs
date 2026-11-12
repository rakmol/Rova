export const productionProfiles=new Set(['production','production-apk']);
export function releaseConfigErrors(env,profile=env.EAS_BUILD_PROFILE){
 if(!productionProfiles.has(profile))return[];
 const errors=[];
 if(env.EXPO_PUBLIC_PILOT_MODE!=='true')errors.push('Pilot builds must restrict offline safety to online corridor approval.');
 if(env.ROVA_APP_VARIANT!=='production')errors.push('Production builds require the production application ID.');
 if(!env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.startsWith('pk.'))errors.push('A public production Mapbox token is required; secret tokens must never enter the app.');
 const required=['EXPO_PUBLIC_PLACES_PROXY_URL','EXPO_PUBLIC_ROUTES_API_URL','EXPO_PUBLIC_COMPLIANCE_API_URL','EXPO_PUBLIC_INCIDENTS_API_URL'];
 for(const name of [...required,'EXPO_PUBLIC_PILOT_API_URL','EXPO_PUBLIC_ACCOUNT_API_URL','EXPO_PUBLIC_NOTIFICATIONS_API_URL','EXPO_PUBLIC_OFFLINE_SAFETY_API_URL']){
  if(!env[name]&&!required.includes(name))continue;
  try{const u=new URL(env[name]);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!u.hostname.includes('.')||/localhost|\.local$|\.internal$|\.exp\.direct$|\.on\.expo\.app$|\.ngrok[^.]*\.|\.invalid$|\.test$|\.example$|(?:^|\.)example\.(?:com|net|org)$|\.trycloudflare\.com$|\.loca\.lt$|\.localtunnel\.me$|\.devtunnels\.ms$|^example\./i.test(u.hostname)||/^[\d.]+$/.test(u.hostname)||u.hostname.startsWith('['))throw Error();}
  catch{errors.push(`${name} must be a permanent public HTTPS service URL without credentials or query parameters.`);}
 }
 if(env.EXPO_PUBLIC_MAPBOX_TRAFFIC_ENABLED==='true')errors.push('Ghana traffic licensing/coverage has not been accepted; traffic must remain disabled.');
 for(const [key,value]of Object.entries(env))if(key.startsWith('EXPO_PUBLIC_')&&value&&(/(?:SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|GEOAPIFY_API_KEY|DATABASE_URL|SIGNING_KEY)/i.test(key)||value.startsWith('sk.')))errors.push('A private credential is configured as a public app variable.');
 return errors;
}
