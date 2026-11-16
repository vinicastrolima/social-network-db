import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',workers:1,use:{baseURL:'http://localhost:3000',screenshot:'only-on-failure',trace:'retain-on-failure'},webServer:{command:'npm start',url:'http://localhost:3000/health',reuseExistingServer:!process.env.CI}});
