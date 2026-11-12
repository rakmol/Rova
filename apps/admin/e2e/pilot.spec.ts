import {test,expect} from '@playwright/test';
test('viewer sees honest pilot readiness and no baseline, with controls denied by the BFF/API',async({page,context})=>{
 await page.goto('/');await page.getByLabel('Email',{exact:true}).fill('viewer@test.invalid');await page.getByLabel('Password',{exact:true}).fill('ISOLATED TEST PASSWORD');await page.getByRole('button',{name:'Sign in securely'}).click();await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 const response=page.waitForResponse(r=>r.url().endsWith('/api/ops/pilot'));await page.getByRole('link',{name:'Accra pilot quality',exact:true}).click();expect((await response).status()).toBe(200);await expect(page.getByText('PILOT READINESS: NO GO',{exact:true})).toBeVisible();await expect(page.getByText('No diagnostic contributions.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Activate',exact:true})).toHaveCount(0);
 const headers={Origin:'http://localhost:3002','X-ROVA-OPS':'1'};expect((await context.request.post('/api/ops/pilot',{headers,data:{}})).status()).toBe(405);expect((await context.request.post('/api/ops/pilot/control',{headers,data:{}})).status()).toBe(403);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
