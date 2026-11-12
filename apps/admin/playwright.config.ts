import{defineConfig}from'@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'*.spec.ts',fullyParallel:false,workers:1,timeout:240000,use:{baseURL:'http://localhost:3002',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},webServer:[
 {command:'node --import tsx e2e/fixture.mts',url:'http://127.0.0.1:4101/health',reuseExistingServer:false,timeout:90000},
 {command:'npx next dev --port 3002',url:'http://localhost:3002',reuseExistingServer:false,timeout:90000,env:{ROVA_ADMIN_TEST_BUILD:'true',ROVA_API_URL:'http://127.0.0.1:4101'}},
]});
