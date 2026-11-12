import {verifyCode,signOut,accountData,backupAccount}from'../account/client';
jest.mock('expo-constants',()=>({__esModule:true,default:{expoConfig:{hostUri:'test.exp.direct'}}}));
jest.mock('../account/local',()=>({clearAccountPlaces:jest.fn(async()=>{}),validateLocal:(v:unknown)=>v}));
test('driver tokens stay out of URLs/storage, account payloads carry no role, and a late login cannot undo sign-out',async()=>{
  const previous=global.fetch;
  const fetchMock=jest.fn().mockResolvedValueOnce({ok:true,json:async()=>({accessToken:'a'.repeat(32),refreshToken:'r'.repeat(32),expiresAt:Date.now()+3600000})})
    .mockResolvedValueOnce({ok:true,json:async()=>({id:'driver',role:'driver',places:[],preferences:{voiceEnabled:true,voiceLanguage:'en-GH',units:'metric'}})})
    .mockResolvedValueOnce({ok:true,json:async()=>({saved:true})}).mockResolvedValueOnce({ok:true,json:async()=>({signedOut:true})});
  global.fetch=fetchMock;
  try{
    await verifyCode('test@example.com','123456');expect((await accountData()).id).toBe('driver');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer '+'a'.repeat(32));expect(fetchMock.mock.calls[1][0]).not.toContain('a'.repeat(32));
    await backupAccount([],{voiceEnabled:true,voiceLanguage:'en-GH',units:'metric'});expect(JSON.parse(fetchMock.mock.calls[2][1].body).role).toBeUndefined();
    await signOut();await expect(accountData()).rejects.toThrow('Sign in');
    let resolve!:(value:unknown)=>void;fetchMock.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    const late=verifyCode('test@example.com','123456');await signOut();resolve({ok:true,json:async()=>({accessToken:'b'.repeat(32),refreshToken:'s'.repeat(32),expiresAt:Date.now()+3600000})});await late;
    await expect(accountData()).rejects.toThrow('Sign in');
  }finally{global.fetch=previous;}
});
