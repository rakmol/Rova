import {DriverInteractionPolicy,acknowledgePassenger,drivingSnapshot,expirePassenger,navigationInteraction,resetPassenger} from '../safety/driving';
import {tx,enabledLocales,resolveLocale,localeReadyForRelease,voiceLocale} from '../i18n';
import {voicePreferenceText,defaults} from '../account/local';
import {resolveTheme} from '../theme/theme';
test('moving forms stay deferred through noisy, stale, duplicate and unknown GPS until sustained stationary fixes',()=>{
 const p=new DriverInteractionPolicy();let now=100000;
 p.update({speed:10,accuracy:5,timestamp:now},now);expect(p.locked).toBe(true);
 p.update({speed:0,accuracy:500,timestamp:now+1000},now+1000);expect(p.locked).toBe(true);
 p.update({speed:null,accuracy:5,timestamp:now+2000},now+2000);expect(p.locked).toBe(true);
 p.update({speed:0,accuracy:5,timestamp:now-20000},now+3000);expect(p.locked).toBe(true);
 for(let i=1;i<=3;i++){now+=3000;p.update({speed:0,accuracy:5,timestamp:now},now);}expect(p.locked).toBe(true);
 now+=3000;p.update({speed:0,accuracy:5,timestamp:now},now);expect(p.locked).toBe(false);
 p.update({speed:12,accuracy:5,timestamp:++now},now);expect(p.locked).toBe(true);
 p.update({speed:0,accuracy:5,timestamp:++now},now);now+=20000;p.update({speed:0,accuracy:5,timestamp:now},now);expect(p.locked).toBe(true);
 p.beginNavigation();expect(p.locked).toBe(true);
});
test('unreviewed Twi/Ga fall back to English, catalogue interpolation is explicit and no locale can release without human reviews',()=>{
 expect(enabledLocales).toEqual(['en-GH']);expect(resolveLocale('tw-GH')).toBe('en-GH');expect(resolveLocale('gaa-GH')).toBe('en-GH');expect(voiceLocale()).toBe('en-GH');
 expect(tx('voice.limitAhead',{speed:50},'gaa-GH')).toBe('Speed limit ahead: 50 kilometres per hour');expect(()=>tx('voice.limitAhead')).toThrow('Missing translation parameter');
 for(const locale of ['en-GH','tw-GH','gaa-GH']as const)expect(localeReadyForRelease(locale)).toBe(false);
 expect(voicePreferenceText(tx('voice.approach',{distance:100,instruction:'TEST TURN'}),{...defaults.preferences,units:'imperial'})).toContain('330 feet');
});
test('passenger acknowledgement expires rather than becoming a permanent bypass',()=>{
 jest.useFakeTimers();navigationInteraction(true);acknowledgePassenger();expect(drivingSnapshot().passenger).toBe(true);
 jest.advanceTimersByTime(300001);expirePassenger();expect(drivingSnapshot().passenger).toBe(false);expect(drivingSnapshot().locked).toBe(true);
 resetPassenger();navigationInteraction(false);jest.useRealTimers();
});
function contrast(a:string,b:string){const lum=(hex:string)=>{const s=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return s[0]*.2126+s[1]*.7152+s[2]*.0722;};const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('day/night text and warning palettes meet 4.5:1 contrast; control boundaries meet 3:1',()=>{
 for(const mode of ['light','dark']as const){const c=resolveTheme(mode,null).colors;
  for(const bg of [c.background,c.surface,c.surfaceRaised])for(const fg of [c.ink,c.inkMuted,c.inkSubtle])expect(contrast(fg,bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c.warning,c.warningTint)).toBeGreaterThanOrEqual(4.5);expect(contrast(c.danger,c.surface)).toBeGreaterThanOrEqual(4.5);expect(contrast(c.brandStrong,c.brandTint)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(mode==='light'?'#FFFFFF':'#0D1D26',c.brand)).toBeGreaterThanOrEqual(4.5);expect(contrast(c.border,c.surface)).toBeGreaterThanOrEqual(3);
 }
});
