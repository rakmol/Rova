/** Two-slot commit: incomplete writes never replace the previously readable download. */
export interface SlotStorage {read(slot:string):Promise<string|null>;write(slot:string,value:string):Promise<void>;pointer():Promise<string|null>;commit(slot:string):Promise<void>}
export function transactionalCache<T>(storage:SlotStorage,validate:(data:unknown)=>T){
 let queue=Promise.resolve();
 return{
  async read():Promise<T|null>{try{const slot=await storage.pointer();if(slot!=='a'&&slot!=='b')return null;const value=await storage.read(slot);return value===null?null:validate(JSON.parse(value));}catch{return null;}},
  write(value:T):Promise<void>{const work=queue.catch(()=>{}).then(async()=>{const data=JSON.stringify(validate(value));if(data.length>3000000)throw new Error('Offline download is too large.');const next=await storage.pointer()==='a'?'b':'a';await storage.write(next,data);const checked=await storage.read(next);if(checked!==data)throw new Error('Offline download verification failed.');validate(JSON.parse(checked));await storage.commit(next);});queue=work;return work;},
 };
}
