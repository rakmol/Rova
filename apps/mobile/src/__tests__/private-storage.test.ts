import {privateStore,type PrivateDisk} from '../privacy/private-store';
import {independentCleanup} from '../privacy/cleanup';

function fixture(){
 const events:string[]=[],slots:Record<string,string>={};let pointer:string|null=null,legacy:string|null=JSON.stringify({secret:'home coordinate'});
 const disk:PrivateDisk={pointer:async()=>pointer,read:async s=>slots[s]??null,write:async(s,text)=>{events.push('write');slots[s]=text;},commit:async s=>{events.push('commit');pointer=s;},legacy:async()=>legacy,removeLegacy:async()=>{events.push('remove plaintext');legacy=null;},erase:async()=>{events.push('erase');pointer=null;legacy=null;for(const k of Object.keys(slots))delete slots[k];}};
 const validate=(v:unknown)=>{if(!v||typeof(v as {secret?:unknown}).secret!=='string')throw Error('invalid');return v as {secret:string};};
 return{disk,events,slots,store:privateStore(disk,()=>({secret:''}),validate),legacy:()=>legacy};
}
test('migration verifies a new copy before committing and removing plaintext',async()=>{const f=fixture();await f.store.load();expect(f.store.read().secret).toBe('home coordinate');expect(f.events).toEqual(['write','commit','remove plaintext']);expect(f.legacy()).toBeNull();});
test('failed readback preserves legacy data and never exposes it as loaded',async()=>{const f=fixture();f.disk.read=async()=>null;await expect(f.store.load()).rejects.toThrow('could not be loaded');expect(f.legacy()).toContain('home coordinate');expect(f.events).toEqual(['write']);expect(f.store.read().secret).toBe('');});
test('a committed corrupt value fails closed without overwriting it or using plaintext',async()=>{const f=fixture();f.disk.pointer=async()=> 'a';f.disk.read=async()=> 'corrupt';await expect(f.store.load()).rejects.toThrow();expect(f.events).toEqual([]);expect(f.store.read().secret).toBe('');});
test('erase wins queued updates and a later restart reads empty data',async()=>{const f=fixture();await f.store.load();const update=f.store.update(()=>({secret:'queued sensitive place'}));const erase=f.store.erase();await Promise.allSettled([update,erase]);expect(f.store.read().secret).toBe('');expect(Object.keys(f.slots)).toHaveLength(0);expect(f.legacy()).toBeNull();});
test('independent cleanup attempts all tasks and accurately reports partial failures',async()=>{const attempted:string[]=[];const result=await independentCleanup(['places','remote','history','routes'].map(name=>({name,run:async()=>{attempted.push(name);if(name==='remote')throw Error('offline');}})));expect(attempted).toEqual(['places','remote','history','routes']);expect(result).toEqual({complete:false,failures:['remote']});});
