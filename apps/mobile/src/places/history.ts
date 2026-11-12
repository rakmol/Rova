import {encryptedStore} from '../privacy/vault';
import {useEffect,useSyncExternalStore} from 'react';
export type SearchHistory={enabled:boolean;queries:string[]};
function validate(raw:unknown):SearchHistory{const h=raw as SearchHistory;if(!h||typeof h.enabled!=='boolean'||!Array.isArray(h.queries))throw new Error('Invalid search history.');return{enabled:h.enabled,queries:h.enabled?h.queries.filter((q):q is string=>typeof q==='string'&&q.trim().length>=2&&q.length<=256).slice(0,10):[]};}
const store=encryptedStore('history',()=>({enabled:false,queries:[]} as SearchHistory),validate,'rova-search-history.json');
export const readHistory=store.read;
export const loadHistory=store.load;
export const historyStorageStatus=store.status;
export function useHistory(){useEffect(()=>{void loadHistory().catch(()=>{});},[]);return useSyncExternalStore(store.subscribe,store.read,store.read);}
export function writeHistory(history:SearchHistory){return history.enabled?store.update(()=>history):store.erase();}
