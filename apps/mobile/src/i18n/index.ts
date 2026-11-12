import english from './en.json';
import reviews from './reviews.json';
export type Locale='en-GH'|'tw-GH'|'gaa-GH';
export type MessageKey=keyof typeof english;
type Review={translationsComplete:boolean;enabledInPreview:boolean;reviewer:string|null;reviewedRevision:number|null;reviewedAt:string|null;pronunciationReviewer:string|null;pronunciationReviewedAt:string|null};
// Add a complete, human-reviewed catalogue here before enabling another language.
const catalogues:Partial<Record<Locale,Record<MessageKey,string>>>={'en-GH':english};
export const localeMetadata=reviews;
export function localeReadyForRelease(locale:Locale,now=Date.now()){
 const r=reviews.locales[locale] as Review;
 return r.translationsComplete&&!!r.reviewer?.trim()&&r.reviewedRevision===reviews.catalogRevision&&!!r.pronunciationReviewer?.trim()
  &&typeof r.reviewedAt==='string'&&Number.isFinite(Date.parse(r.reviewedAt))&&Date.parse(r.reviewedAt)<=now
  &&typeof r.pronunciationReviewedAt==='string'&&Number.isFinite(Date.parse(r.pronunciationReviewedAt))&&Date.parse(r.pronunciationReviewedAt)<=now;
}
export const enabledLocales:readonly Locale[]=Object.freeze((Object.keys(reviews.locales)as Locale[]).filter(locale=>!!catalogues[locale]&&(reviews.locales[locale]as Review).enabledInPreview&&(locale==='en-GH'||localeReadyForRelease(locale))));
export function resolveLocale(requested:string):Locale{return enabledLocales.includes(requested as Locale)?requested as Locale:'en-GH';}
export function tx(key:MessageKey,values:Record<string,string|number>={},requested='en-GH'):string{
 const catalogue=catalogues[resolveLocale(requested)]??english;
 return catalogue[key].replace(/\{([a-zA-Z]+)\}/g,(_,name)=>{if(values[name]===undefined)throw new Error('Missing translation parameter: '+name);return String(values[name]);});
}
export const voiceLocale=(requested:Locale='en-GH')=>resolveLocale(requested);
