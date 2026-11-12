import {clearLocalDriverData,defaults,readDriverData,saveLocalPlace,travelDistance,updateDriverData,validateLocal,voicePreferenceText}from'../account/local';
const mockDisk={contents:'',exists:false};
jest.mock('expo-file-system',()=>({Paths:{document:'test://'},File:class{get exists(){return mockDisk.exists;}create(){mockDisk.exists=true;}textSync(){return mockDisk.contents;}write(text:string){mockDisk.contents=text;}}}));
test('guest saved places replace Home/Work, bound favorites, clear atomically and persist no routes or credentials',async()=>{
  expect(readDriverData().places).toEqual([]);
  const home={clientKey:'home-a',kind:'home' as const,label:'Test home',address:'Test only',attribution:'User entered',lon:-.2,lat:5.6};
  await saveLocalPlace(home);await saveLocalPlace({...home,clientKey:'home-b',label:'Replacement'});
  expect(readDriverData().places).toHaveLength(1);expect(readDriverData().places[0].label).toBe('Replacement');
  const malicious={preferences:defaults.preferences,places:[home],routes:[['sensitive']],accessToken:'secret',history:['private']};
  expect(validateLocal(malicious)).toEqual({preferences:defaults.preferences,places:[home]});
  const pending=updateDriverData(d=>({...d,places:[home]}));const clear=clearLocalDriverData();await Promise.allSettled([pending,clear]);expect(readDriverData().places).toEqual([]);expect(mockDisk.contents).not.toContain('Test home');expect(mockDisk.contents).not.toContain('accessToken');
  expect(()=>validateLocal({preferences:defaults.preferences,places:[{...home,lat:100}]})).toThrow();
});
test('unit and language preferences do not convert legally labelled km/h warnings',()=>{
  expect(travelDistance(1609.344,'imperial')).toBe('1.0 mi');expect(travelDistance(500,'metric')).toBe('500 m');
  expect(voicePreferenceText('In 100 metres. Turn left.',{...defaults.preferences,units:'imperial'})).toBe('In 330 feet. Turn left.');
  expect(voicePreferenceText('Speed limit ahead: 50 kilometres per hour',{...defaults.preferences,units:'imperial'})).toContain('50 kilometres per hour');
});
