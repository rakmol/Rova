import {useEffect,useState} from 'react';
import {Linking,Switch,Text,TextInput,View} from 'react-native';
import {router} from 'expo-router';
import type {NotificationPreferences,RenewalKind} from '@rova/shared';
import {ActionButton,Surface} from '../components/ui';
import {useRovaTheme} from '../theme/ThemeProvider';
import {useDriverData} from '../account/local';
import {useNotificationData,loadNotificationData} from './storage';
import {eraseNotifications,saveNotificationPreferences} from './runtime';
import {notificationsAvailable,phonePermission} from './native';
export function NotificationSettings(){const data=useNotificationData(),places=useDriverData().places,{theme}=useRovaTheme();const [edited,setDraft]=useState<NotificationPreferences|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[permission,setPermission]=useState('Not checked');const draft=edited??data.preferences;const ink={color:theme.colors.ink},muted={color:theme.colors.inkMuted};
 useEffect(()=>{let active=true;void loadNotificationData();if(notificationsAvailable())void phonePermission(false).then(p=>{if(active)setPermission(p.granted?'Allowed':p.canAskAgain?'Not allowed':'Blocked — change phone settings');}).catch(()=>{if(active)setPermission('Unavailable');});return()=>{active=false;};},[]);
 async function run(work:()=>Promise<string>){if(busy)return;setBusy(true);try{setMessage(await work());setDraft(null);if(notificationsAvailable())setPermission((await phonePermission(false)).granted?'Allowed':'Not allowed');}catch(e){setMessage(e instanceof Error?e.message:'Could not save notifications.');}finally{setBusy(false);}}
 const toggle=(key:'enabled'|'closures'|'policy'|'reminders',label:string)=><View key={key} style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={[ink,{flex:1,fontSize:16}]}>{label}</Text><Switch accessibilityLabel={label} disabled={busy||!data.loaded} value={draft[key]} onValueChange={value=>setDraft(previous=>{const d=previous??data.preferences;return ({...d,[key]:value});})}/></View>;
 const change=(fn:(d:NotificationPreferences)=>NotificationPreferences)=>setDraft(previous=>fn(previous??data.preferences));
 const renewal=(kind:RenewalKind,value:string)=>change(d=>({...d,renewals:[...d.renewals.filter(r=>r.kind!==kind),...(value?[{kind,dueDate:value}]:[])]}));
 return <Surface style={{gap:14,marginBottom:18}}><Text style={[ink,{fontSize:20,fontWeight:'800'}]}>Optional notifications</Text><Text style={muted}>Off by default. No marketing or current-trip targeting. Phone permission: {permission}. Remote delivery is awaiting Firebase setup.</Text>
 {!notificationsAvailable()&&<Text style={muted}>An updated app installation is needed for notifications. Navigation remains available.</Text>}
 {toggle('enabled','Allow ROVA notifications')}{toggle('closures','Closures near selected saved regions')}{toggle('policy','Announcements from verified official sources')}{toggle('reminders','Vehicle renewal reminders')}
 <Text style={muted}>Closure alerts are community-reviewed reports, separate from authority-verified announcements. Select up to 5 saved regions; only an approximate 2 km grid centre is shared for a 5 km radius. Your current trip is not used.</Text>
 {places.filter(p=>p.lon>=-4&&p.lon<=2&&p.lat>=4&&p.lat<=12).map(p=>{const id=`region:${Math.round(p.lon*50)/50}:${Math.round(p.lat*50)/50}`;const selected=draft.regions.some(r=>r.id===id);return <ActionButton key={p.clientKey} secondary disabled={busy} title={`${selected?'Selected: ':''}${p.label}`} onPress={()=>change(d=>({...d,regions:selected?d.regions.filter(r=>r.id!==id):d.regions.length<5?[...d.regions,{id,label:p.label.slice(0,80),lon:Math.round(p.lon*50)/50,lat:Math.round(p.lat*50)/50}]:d.regions}))}/>;})}
 {!places.length&&<Text style={muted}>Save a place first to choose a closure region.</Text>}
 <ActionButton secondary disabled={busy} title={`Remote daily cap: ${draft.dailyCap} (tap to change)`} onPress={()=>change(d=>({...d,dailyCap:d.dailyCap===1?2:1}))}/>
 <Text style={muted}>Remote updates: at most 6 per rolling week, quiet from 9 p.m. to 8 a.m. Ghana time. Reminders: 9 a.m. Africa/Accra, 7 days before, 1 day before and on the due date; at most 2 per day and 6 per week. Your phone may delay delivery.</Text>
 {(['insurance','roadworthiness'] as const).map(kind=><View key={kind} style={{gap:8}}><Text style={ink}>{kind==='insurance'?'Insurance':'Roadworthiness'} renewal date (YYYY-MM-DD)</Text><TextInput accessibilityLabel={`${kind} renewal date`} placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.inkMuted} value={draft.renewals.find(r=>r.kind===kind)?.dueDate??''} editable={!busy} maxLength={10} keyboardType="numbers-and-punctuation" onChangeText={value=>renewal(kind,value)} style={{minHeight:56,borderWidth:1,borderColor:theme.colors.border,borderRadius:12,padding:12,color:theme.colors.ink,fontSize:16}}/></View>)}
 <Text style={muted}>Dates stay encrypted on this phone. Do not enter document or policy numbers. No reminders are sent unless you enable and save them.</Text>
 <ActionButton title="Save notification preferences" disabled={busy||!data.loaded} onPress={()=>{void run(()=>saveNotificationPreferences(draft as NotificationPreferences));}}/>
 <ActionButton secondary title="Open phone notification settings" onPress={()=>{void Linking.openSettings().catch(()=>setMessage('Open ROVA permissions in your phone settings.'));}}/>
 <ActionButton secondary title="Read road and policy updates" onPress={()=>router.push('/notifications')}/>
 <ActionButton secondary title="Turn off and erase notification data" disabled={busy} onPress={()=>{void run(eraseNotifications);}}/>
 {!!(message||data.error)&&<Text accessibilityLiveRegion="polite" style={muted}>{message||data.error}</Text>}
 </Surface>;
}
