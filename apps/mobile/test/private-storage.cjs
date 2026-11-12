// UI/client tests use a dependency-injected disk. Native AES is tested on devices separately.
jest.mock('../src/privacy/vault',()=>{
 const {privateStore}=require('../src/privacy/private-store');
 return {encryptedStore:(_name,empty,validate)=>{let pointer=null,slots={};return privateStore({pointer:async()=>pointer,read:async slot=>slots[slot]??null,write:async(slot,text)=>{slots[slot]=text;},commit:async slot=>{pointer=slot;},legacy:async()=>null,removeLegacy:async()=>{},erase:async()=>{pointer=null;slots={};}},empty,validate);},credentialStore:()=>{let credential=null;return{read:async()=>credential,write:async value=>{credential=value;},erase:async()=>{credential=null;}};}};
});
