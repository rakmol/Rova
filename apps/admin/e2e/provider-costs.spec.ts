import {test,expect} from '@playwright/test';
test('Batch A provider ledger is read-only, separates measured reservations from pricing, and fits a phone',async({page,context})=>{
 await page.goto('/');
 await page.getByLabel('Email',{exact:true}).fill('viewer@test.invalid');
 await page.getByLabel('Password',{exact:true}).fill('ISOLATED TEST PASSWORD');
 const signedIn=page.waitForResponse(r=>r.url().endsWith('/api/ops/login'));
 await page.getByRole('button',{name:'Sign in securely'}).click();
 expect((await signedIn).status()).toBe(200);
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 const response=page.waitForResponse(r=>r.url().endsWith('/api/ops/provider-costs'));
 await page.getByRole('link',{name:'Provider costs & audit',exact:true}).click();
 const result=await response;expect(result.status()).toBe(200);const ledger=await result.json();
 expect(ledger.monthlyEnforcement).toBe('database_shared');expect(ledger.actualSpendUsd).toBeNull();expect(ledger.usageStatus).toBe('available');expect(Array.isArray(ledger.actualUsage)).toBe(true);
 await expect(page.getByText('Ledger: available.',{exact:false})).toBeVisible();
 await page.getByLabel('Monthly Mapbox/Legacy maps active users').fill('26000');
 await expect(page.getByText('Partial USD illustration: 4.00.',{exact:false})).toBeVisible();
 const write=await context.request.post('/api/ops/provider-costs',{headers:{Origin:'http://localhost:3002','X-ROVA-OPS':'1'},data:{monthlyQuota:1}});expect(write.status()).toBe(405);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
