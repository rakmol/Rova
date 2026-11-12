const fs=require('node:fs');
const path=require('node:path');
const reviews=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/i18n/reviews.json'),'utf8'));
if(['development','preview'].includes(process.env.EAS_BUILD_PROFILE)&&!process.argv.includes('--release')){console.log('English preview; human localization review pending before release.');process.exit(0);}
const english=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/i18n/en.json'),'utf8'));
const placeholders=value=>[...value.matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]).sort().join(',');
for(const[locale,r]of Object.entries(reviews.locales)){
 if(!r.enabledInPreview)continue;
 const approved=r.translationsComplete&&typeof r.reviewer==='string'&&r.reviewer.trim()&&r.reviewedRevision===reviews.catalogRevision&&typeof r.pronunciationReviewer==='string'&&r.pronunciationReviewer.trim()&&r.reviewedAt&&r.pronunciationReviewedAt&&Number.isFinite(Date.parse(r.reviewedAt))&&Date.parse(r.reviewedAt)<=Date.now()&&Number.isFinite(Date.parse(r.pronunciationReviewedAt))&&Date.parse(r.pronunciationReviewedAt)<=Date.now();
 const file=path.join(__dirname,`../src/i18n/${locale==='en-GH'?'en':locale}.json`);
 let catalogue;try{catalogue=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 const complete=catalogue&&Object.keys(catalogue).length===Object.keys(english).length&&Object.entries(english).every(([key,value])=>typeof catalogue[key]==='string'&&catalogue[key].trim()&&placeholders(catalogue[key])===placeholders(value));
 if(!approved||!complete){console.error(`Release blocked: ${locale} needs a complete catalogue and genuine human copy/pronunciation review for the current revision.`);process.exit(1);}
}
console.log('Enabled locale catalogues and human reviews checked.');
