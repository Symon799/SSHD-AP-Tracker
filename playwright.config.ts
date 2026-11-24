import { defineConfig, devices } from '@playwright/test';

const testBuild = 'node_modules/.cache/tracker-e2e';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: [
        {
            command: 'node tests/e2e/mock-archipelago-server.mjs',
            url: 'http://127.0.0.1:38281/health',
            reuseExistingServer: false,
            timeout: 120_000,
        },
        {
            // Use a built bundle so Vite cannot reload the app mid-test.
            command: `npm run build -- --mode e2e --outDir ${testBuild} && npm run serve -- --mode e2e --outDir ${testBuild} --host 127.0.0.1 --port 4173 --strictPort`,
            url: 'http://127.0.0.1:4173/',
            reuseExistingServer: false,
            timeout: 120_000,
        },
    ],
});
