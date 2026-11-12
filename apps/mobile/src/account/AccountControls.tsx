import {useRoutePreview} from '../map/RouteProvider';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { ActionButton, Surface } from '../components/ui';
import { useRovaTheme } from '../theme/ThemeProvider';
import { accountData, accountStatus, backupAccount, deleteAccount, eraseAccountData, sendCode, signOut, useDriverSession, verifyCode } from './client';
import { readDriverData, updateDriverData } from './local';
import {erasePhoneData} from '../privacy/erase';
export function AccountControls(){
  const {setRoute,setPickedDestination,setSelectedRoutingOption}=useRoutePreview();
  const {theme}=useRovaTheme();const ink={color:theme.colors.ink};const muted={color:theme.colors.inkMuted};
  const session=useDriverSession();const [enabled,setEnabled]=useState(false);const [email,setEmail]=useState('');const [code,setCode]=useState('');const [sent,setSent]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{let active=true;void accountStatus().then(data=>{if(active)setEnabled(data.enabled===true);}).catch(()=>{});return()=>{active=false;};},[]);
  async function run(work:()=>Promise<string>){if(busy)return;setBusy(true);setMessage('');try{setMessage(await work());}catch(e){setMessage(e instanceof Error?e.message:'Could not complete that action.');}finally{setBusy(false);}}
  return <Surface style={{gap:12,marginBottom:18}}>
    <Text style={[ink,{fontWeight:'800',fontSize:18}]}>{session?'Driver account':'Guest mode'}</Text>
    <Text style={muted}>Navigation, reporting and local saved places work without signing in. Sign-in is optional. No journey history is stored.</Text>
    {!session&&(!enabled?<Text style={muted}>Optional sign-in is not available yet. Continue using ROVA as a guest.</Text>:<>
      <TextInput accessibilityLabel="Sign-in email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} placeholder="Email address" placeholderTextColor={theme.colors.inkMuted} value={email} onChangeText={value=>{setEmail(value);setCode('');setSent(false);}} editable={!busy} style={[ink,{borderWidth:1,borderColor:theme.colors.border,borderRadius:12,padding:12}]}/>
      <ActionButton title="Email me a sign-in code" disabled={busy||!email.includes('@')} onPress={()=>{void run(async()=>{await sendCode(email);setSent(true);return 'Check your email for the code.';});}}/>
      {sent&&<><TextInput accessibilityLabel="Email sign-in code" keyboardType="number-pad" maxLength={8} value={code} onChangeText={setCode} editable={!busy} style={[ink,{borderWidth:1,borderColor:theme.colors.border,padding:12}]}/><ActionButton title="Verify code" disabled={busy||code.length<6} onPress={()=>{void run(async()=>{await verifyCode(email,code);setEmail('');setCode('');setSent(false);return 'Signed in. Places stay on this phone until you choose to sync.';});}}/></>}
    </>)}
    {session&&<>
      <Text style={muted}>Sync is manual. Sign-in expires when you close the app; credentials are not saved on this phone.</Text>
      <ActionButton title="Back up phone places and preferences to my account" disabled={busy} onPress={()=>Alert.alert('Replace account saved places?','Your current phone places and voice preferences will replace the account copy. No routes or history are sent.',[{text:'Cancel',style:'cancel'},{text:'Back up',onPress:()=>{void run(async()=>{const data=readDriverData();await backupAccount(data.places,data.preferences);return 'Account copy updated.';});}}])}/>
      <ActionButton title="Load account places onto this phone" secondary disabled={busy} onPress={()=>Alert.alert('Replace phone saved places?','This replaces your current phone saved places and preferences with the account copy.',[{text:'Cancel',style:'cancel'},{text:'Replace',onPress:()=>{void run(async()=>{const data=await accountData();await updateDriverData(()=>({preferences:data.preferences,places:data.places.map(p=>({...p,owner:data.id}))}));return 'Account places loaded. They are removed from this phone on sign-out.';});}}])}/>
      <ActionButton title="Erase account saved data" secondary disabled={busy} onPress={()=>Alert.alert('Erase account saved data?','This deletes the account copy of saved places and preferences. Your account remains active.',[{text:'Cancel',style:'cancel'},{text:'Erase',style:'destructive',onPress:()=>{void run(async()=>{await eraseAccountData();return 'Account saved data erased.';});}}])}/>
      <ActionButton title="Sign out / continue as guest" secondary disabled={busy} onPress={()=>{void run(async()=>{await signOut();return 'You are using ROVA as a guest.';});}}/>
      <ActionButton title="Delete my account" secondary disabled={busy} onPress={()=>Alert.alert('Delete your ROVA account?','This erases saved account data and phone places/preferences/searches, and requests deletion from the sign-in provider. Anonymous public safety reports are handled separately below.',[{text:'Cancel',style:'cancel'},{text:'Delete account',style:'destructive',onPress:()=>{void run(async()=>{let result:Awaited<ReturnType<typeof deleteAccount>>|undefined,accountFailed=false;try{result=await deleteAccount();}catch{accountFailed=true;}await erasePhoneData(()=>{setRoute(null);setPickedDestination(null);setSelectedRoutingOption(null);});if(accountFailed||!result)throw new Error('Phone saved data erased. Account deletion could not be confirmed; reconnect and retry.');return result.providerDeletion==='complete'?'Account deleted. Guest navigation remains available.':'ROVA account data erased. Sign-in provider deletion is queued for retry.';});}}])}/>
    </>}
    {!!message&&<Text accessibilityLiveRegion="polite" style={muted}>{message}</Text>}
    {busy&&<View><Text style={muted}>Please wait...</Text></View>}
  </Surface>;
}
