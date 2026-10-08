import { expect, test } from '@playwright/test';

test.describe('options page', () => {
    test('loads the local SSHD logic and exposes the connection controls', async ({
        page,
    }) => {
        const pageErrors: Error[] = [];
        page.on('pageerror', (error) => pageErrors.push(error));

        await page.goto('/');

        await expect(
            page.getByRole('heading', {
                name: /Skyward Sword HD Archipelago Tracker/,
            }),
        ).toBeVisible();
        await expect(page.getByText('About This Tracker')).toBeVisible();
        await expect(
            page.getByText('Skyward Sword HD Archipelago only', {
                exact: false,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Connect', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Launch New Tracker' }),
        ).toBeDisabled();
        await expect(
            page.getByRole('button', { name: /Continue Tracker/ }),
        ).toBeDisabled();
        expect(pageErrors).toEqual([]);
    });

    test('keeps the connection form editable while disconnected', async ({
        page,
    }) => {
        await page.goto('/');

        const serverInput = page.getByPlaceholder('archipelago.gg:XXXXX');
        const slotInput = page.getByPlaceholder('Slot name');
        const passwordInput = page.getByPlaceholder('Password (optional)');

        await expect(serverInput).toBeEditable();
        await expect(slotInput).toBeEditable();
        await expect(passwordInput).toBeEditable();

        await serverInput.fill('localhost:38281');
        await slotInput.fill('Test Player');
        await expect(serverInput).toHaveValue('localhost:38281');
        await expect(slotInput).toHaveValue('Test Player');
    });
});
