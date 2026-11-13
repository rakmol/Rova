import{test,expect,type Browser,type Page}from'@playwright/test';
async function login(browser:Browser,role:string){
 const context=await browser.newContext({baseURL:'http://localhost:3002'});const page=await context.newPage();await page.goto('/');
 await page.getByLabel('Email',{exact:true}).fill(role+'@test.invalid');await page.getByLabel('Password',{exact:true}).fill('ISOLATED TEST PASSWORD');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/ops/login'));
 await page.getByRole('button',{name:'Sign in securely'}).click();const body=await(await response).json();expect(body.accessToken).toBeUndefined();
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 const overview=await context.request.get('/api/ops/overview');expect(overview.status()).toBe(200);
 await expect(page.getByLabel('Six-digit code')).toHaveCount(0);
 await expect(page.getByText(role==='reviewer2'?'reviewer · Signed in':`${role} · Signed in`,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.cookie)).not.toContain('rova_ops');
 const cookies=await context.cookies();expect(cookies.filter(c=>c.name.startsWith('rova_ops')).every(c=>c.httpOnly&&c.sameSite==='Strict')).toBe(true);
 return{page,context};
}
async function openSource(page:Page,label:string){await page.getByRole('link',{name:'Sources',exact:true}).click();const response=page.waitForResponse(r=>r.url().includes('/api/ops/detail?'));await page.getByRole('button',{name:label,exact:true}).click();expect((await response).status()).toBe(200);await expect(page.getByRole('heading',{name:'Record review',exact:true})).toBeVisible();}
test('browser supports password-only login with RBAC and full independently reviewed revision workflow with responsive tables',async({browser})=>{
 const editor=await login(browser,'editor');const r1=await login(browser,'reviewer');const r2=await login(browser,'reviewer2');const admin=await login(browser,'administrator');
 const title='ISOLATED BROWSER EVIDENCE';
 await editor.page.getByRole('link',{name:'Sources',exact:true}).click();await editor.page.getByRole('button',{name:'New draft',exact:true}).click();
 const date=new Date(Date.now()-60000).toISOString(),expiry=new Date(Date.now()+86400000*30).toISOString();
 const source={kind:'official',authority:'ISOLATED AUTOMATED BROWSER TEST',title,reference:'TEST ONLY NOT REAL SAFETY DATA',source_url:'https://example.com/isolated-browser-test',license_note:'ISOLATED TEST',published_at:date,valid_from:date,expires_at:expiry};
 await editor.page.getByLabel('Record fields (JSON)').fill(JSON.stringify(source));await editor.page.getByLabel('Review comment / evidence reference').fill('ISOLATED browser creation evidence');await editor.page.getByRole('button',{name:'Save new revision for review'}).click();
 await expect(editor.page.getByRole('heading',{name:'Revision 1',exact:true})).toBeVisible();await expect(editor.page.getByRole('button',{name:'Publish reviewed revision'})).toHaveCount(0);
 for(const p of [r1.page,r2.page]){await openSource(p,title);await p.getByLabel('Review comment / evidence reference').fill('ISOLATED independent browser review');await p.getByRole('button',{name:'Approve current revision',exact:true}).click();await expect(p.locator('p[role=alert]')).toContainText('Independent review recorded');}
 await openSource(admin.page,title);await admin.page.getByLabel('Review comment / evidence reference').fill('ISOLATED reviewed browser publication');admin.page.once('dialog',dialog=>dialog.accept());await admin.page.getByRole('button',{name:'Publish reviewed revision',exact:true}).click();await expect(admin.page.locator('p[role=alert]')).toContainText('Publication completed');
 await openSource(editor.page,title);await editor.page.getByLabel('Record fields (JSON)').fill(JSON.stringify({...source,title:title+' REVISED'}));await editor.page.getByLabel('Review comment / evidence reference').fill('ISOLATED changed evidence must be reviewed');await editor.page.getByRole('button',{name:'Save new revision for review'}).click();await expect(editor.page.getByRole('heading',{name:'Revision 2',exact:true})).toBeVisible();
 await openSource(admin.page,title+' REVISED');await admin.page.getByLabel('Review comment / evidence reference').fill('ISOLATED premature publication attempt');admin.page.once('dialog',dialog=>dialog.accept());await admin.page.getByRole('button',{name:'Publish reviewed revision',exact:true}).click();await expect(admin.page.locator('p[role=alert]')).toContainText('Independent approvals');
 await openSource(editor.page,title+' REVISED');await editor.page.getByLabel('Review comment / evidence reference').fill('ISOLATED restore prior content without approval');await editor.page.getByRole('button',{name:'Restore content before revision 2',exact:true}).click();await expect(editor.page.getByRole('heading',{name:'Revision 3',exact:true})).toBeVisible();
 const viewer=await login(browser,'viewer');await openSource(viewer.page,title);await expect(viewer.page.getByRole('button',{name:'New draft',exact:true})).toHaveCount(0);await expect(viewer.page.getByRole('button',{name:'Approve current revision',exact:true})).toHaveCount(0);
 const csrf=await viewer.context.request.post('/api/ops/revise',{headers:{Origin:'https://untrusted.invalid','X-ROVA-OPS':'1'},data:{}});expect(csrf.status()).toBe(403);
 const forbidden=await viewer.context.request.post('/api/ops/revise',{headers:{Origin:'http://localhost:3002','X-ROVA-OPS':'1'},data:{}});expect(forbidden.status()).toBe(403);
 await viewer.page.getByRole('link',{name:'Sponsorship plan & analytics',exact:true}).click();await expect(viewer.page.getByText('Reviews prepare drafts only; there is no way to publish an ad.',{exact:false})).toBeVisible();
 await viewer.page.getByRole('link',{name:'Sponsored draft review',exact:true}).click();await expect(viewer.page.getByRole('button',{name:'New draft',exact:true})).toHaveCount(0);
 await admin.page.getByRole('link',{name:'Sponsored draft review',exact:true}).click();await admin.page.getByRole('button',{name:'New draft',exact:true}).click();await expect(admin.page.getByRole('button',{name:'Publish reviewed revision'})).toHaveCount(0);
 const costs=viewer.page.waitForResponse(r=>r.url().endsWith('/api/ops/provider-costs'));await viewer.page.getByRole('link',{name:'Provider costs & audit',exact:true}).click();expect((await costs).status()).toBe(200);await expect(viewer.page.getByText('Daily and monthly ROVA API request limits use shared database counters.',{exact:false})).toBeVisible();await viewer.page.getByLabel('Monthly Mapbox/Legacy maps active users').fill('26000');await expect(viewer.page.getByText('Partial USD illustration: 4.00.',{exact:false})).toBeVisible();
 await viewer.page.setViewportSize({width:390,height:844});await viewer.page.getByRole('link',{name:'Overview',exact:true}).click();await expect(viewer.page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();expect(await viewer.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await admin.page.getByRole('link',{name:'Audit trail',exact:true}).click();await expect(admin.page.getByRole('cell',{name:'revert',exact:true}).first()).toBeVisible();
 for(const c of [editor.context,r1.context,r2.context,admin.context,viewer.context])await c.close();
});

test('community suggestions require reviewer access and reviewed suggestions do not become confirmed safety records',async({browser})=>{
 const admin=await login(browser,'administrator'),viewer=await login(browser,'viewer');
 let token='';
 try{
  const session=await admin.context.request.post('http://127.0.0.1:4101/v1/incidents/session',{data:{platform:'android'}});expect(session.status()).toBe(201);token=(await session.json()).token;
  const headers={Authorization:'Bearer '+token};
  const sent=await admin.context.request.post('http://127.0.0.1:4101/v1/incidents/contributions',{headers,data:{kind:'fixed_camera',name:'ISOLATED BROWSER EQUIPMENT',category:'unknown',lon:-.2,lat:5.6,interaction:'passenger'}});expect(sent.status()).toBe(201);
  expect((await viewer.context.request.get('/api/ops/contributions')).status()).toBe(403);
  await expect(viewer.page.getByRole('link',{name:'Community contributions',exact:true})).toHaveCount(0);
  await admin.page.getByRole('link',{name:'Community contributions',exact:true}).click();
  await expect(admin.page.getByRole('heading',{name:'ISOLATED BROWSER EQUIPMENT',exact:true})).toBeVisible();
  await expect(admin.page.getByRole('button',{name:'Mark suggestion reviewed',exact:true})).toBeDisabled();
  await admin.page.getByLabel('Review comment (at least 10 characters)').fill('ISOLATED fixture review; not verified enforcement');
  await admin.page.getByRole('button',{name:'Mark suggestion reviewed',exact:true}).click();
  await expect(admin.page.getByRole('alert')).toContainText('Suggestion review saved');
  const mine=await admin.context.request.get('http://127.0.0.1:4101/v1/incidents/contributions/mine',{headers});expect((await mine.json()).rows[0].status).toBe('reviewed');expect((await mine.json()).authorityVerified).toBe(false);
 }finally{
  if(token)await admin.context.request.post('http://127.0.0.1:4101/v1/incidents/erase-device',{headers:{Authorization:'Bearer '+token},data:{}});
  await admin.context.close();await viewer.context.close();
 }
});
