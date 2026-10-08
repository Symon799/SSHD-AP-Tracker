import { expect, test, type Page } from '@playwright/test';

async function connectToFixture(page: Page) {
    await page.goto('/');
    await expect(
        page.getByRole('button', { name: 'Connect', exact: true }),
    ).toBeEnabled();

    await page.getByPlaceholder('archipelago.gg:XXXXX').fill('localhost:38281');
    await page.getByPlaceholder('Slot name').fill('Test Player');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    await expect(
        page.getByText('Connected to localhost:38281 as Test Player'),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Launch New Tracker' }),
    ).toBeEnabled();
}

test.describe('tracker with simulated Archipelago server', () => {
    test('connects, launches the tracker, and renders the map', async ({
        page,
    }) => {
        await connectToFixture(page);

        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();

        await expect(page).toHaveURL(/\/tracker$/);
        await expect(page.locator('img[src*="Sky"]').first()).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Open Server and Tools' }),
        ).toBeVisible();
    });

    test('applies checked locations and received items to the tracker state', async ({
        page,
    }) => {
        await connectToFixture(page);

        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();
        await expect(page).toHaveURL(/\/tracker$/);

        const sword = page
            .getByRole('button', { name: 'Progressive Sword' })
            .first();
        await expect(sword).toBeVisible();
        await sword.hover();
        await expect(page.getByText('Progressive Sword (2/6)')).toBeVisible();

        await page
            .getByRole('button', { name: 'Open Server and Tools' })
            .click();

        await expect(page.getByText('Checked Locations: 1')).toBeVisible();
        await expect(page.getByText('Total Locations: 3')).toBeVisible();
    });
});
