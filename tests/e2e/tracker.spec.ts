import { expect, test, type Page } from '@playwright/test';

async function connectToFixture(page: Page, slot = 'Test Player') {
    await page.goto('/');
    await expect(
        page.getByRole('button', { name: 'Connect', exact: true }),
    ).toBeEnabled();

    await page.getByPlaceholder('archipelago.gg:XXXXX').fill('localhost:38281');
    await page.getByPlaceholder('Slot name').fill(slot);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    await expect(
        page.getByText(`Connected to localhost:38281 as ${slot}`),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Launch New Tracker' }),
    ).toBeEnabled();
}

test.describe('tracker with simulated Archipelago server', () => {
    for (const [slot, spiralCharge] of [
        ['Loftwing Player', false],
        ['Spiral Charge Player', true],
        ['Starting Loftwing Player', false],
        ['Starting Spiral Charge Player', true],
    ] as const) {
        test(`synchronizes Progressive Loftwing for ${slot}`, async ({
            page,
        }) => {
            const errors: string[] = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await connectToFixture(page, slot);
            page.once('dialog', (dialog) => dialog.accept());
            await page
                .getByRole('button', { name: 'Launch New Tracker' })
                .click();
            await expect(
                page
                    .getByRole('button', { name: 'Loftwing', exact: true })
                    .locator('img'),
            ).toHaveAttribute('src', /\/Loftwing\.png/);
            await expect(
                page
                    .getByRole('button', { name: 'Spiral Charge', exact: true })
                    .locator('img'),
            ).toHaveAttribute(
                'src',
                spiralCharge
                    ? /\/bird_statuette\.png/
                    : /\/no_bird_statuette\.png/,
            );
            expect(errors).toEqual([]);
        });
    }

    test('restores a valid selection per map and marks it with a pointer', async ({
        page,
    }) => {
        await connectToFixture(page);
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();
        await page
            .getByRole('button', { name: 'Central Skyloft', exact: true })
            .click();
        await page
            .getByRole('img', { name: 'Back to Sky', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Sky', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
            page.getByRole('button', { name: /^Sky \(/ }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Thunderhead', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Skyloft', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Central Skyloft', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
            page.getByRole('button', { name: /^Central Skyloft \(/ }),
        ).toBeVisible();
        await page
            .getByRole('img', { name: 'Back to Sky', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Thunderhead', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await page
            .getByRole('button', { name: 'Faron Province', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Sealed Grounds', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await page
            .getByRole('button', { name: 'Deep Woods', exact: true })
            .click();
        const square = page.getByRole('button', {
            name: 'Deep Woods',
            exact: true,
        });
        const pointer = page.getByTestId('selected-map-arrow');
        await expect(pointer).toHaveCount(1);
        await expect(pointer).toHaveCSS('border-bottom-color', 'rgb(0, 0, 0)');
        const squareBounds = await square.boundingBox();
        const pointerBounds = await pointer.boundingBox();
        expect(pointerBounds!.y).toBeGreaterThan(
            squareBounds!.y + squareBounds!.height,
        );
        await page.screenshot({
            path: 'test-results/selected-map-pointer.png',
            animations: 'disabled',
        });
        await page
            .getByRole('img', { name: 'Back to Sky', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Faron Province', exact: true })
            .click();
        await expect(square).toHaveAttribute('aria-pressed', 'true');
        await expect(
            page.getByRole('button', { name: /^Deep Woods \(/ }),
        ).toBeVisible();
    });

    test('synchronizes bird statue unlocks and exposes the per-province inventory', async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) =>
            errors.push(error.stack ?? error.message),
        );
        await connectToFixture(page, 'Feature Player');
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();
        const statues = page.getByRole('button', { name: 'Bird Statues 2/26' });
        await expect(statues).toBeVisible();
        await expect(statues.locator('img')).toHaveAttribute(
            'src',
            /bird_statue\.png/,
        );
        const scrapperBounds = await page
            .getByRole('button', { name: 'Scrapper', exact: true })
            .boundingBox();
        const statueBounds = await statues.locator('..').boundingBox();
        const offsets = await statues.evaluate((element) => {
            const styles = getComputedStyle(element.parentElement!);
            return {
                x:
                    parseFloat(styles.getPropertyValue('--button-offset-x')) ||
                    0,
                y:
                    parseFloat(styles.getPropertyValue('--button-offset-y')) ||
                    0,
            };
        });
        expect(scrapperBounds).not.toBeNull();
        expect(statueBounds).not.toBeNull();
        expect(statueBounds!.x - offsets.x).toBeGreaterThanOrEqual(
            scrapperBounds!.x + scrapperBounds!.width,
        );
        expect(
            Math.abs(statueBounds!.y - offsets.y - scrapperBounds!.y),
        ).toBeLessThanOrEqual(1);
        await page.screenshot({
            path: 'test-results/bird-statue-grid.png',
            animations: 'disabled',
        });
        await statues.click();
        const dialog = page.getByRole('dialog', {
            name: 'Bird Statue Unlocks',
        });
        await expect(dialog).toBeFocused();
        const dialogCoversPointer = await page
            .getByTestId('selected-map-arrow')
            .evaluate((pointer) => {
                // Include the decorative arrow in hit testing to detect stacking
                // regressions despite its normal pointer-events: none.
                const previous = pointer.style.pointerEvents;
                pointer.style.pointerEvents = 'auto';
                try {
                    const bounds = pointer.getBoundingClientRect();
                    const topElement = document.elementFromPoint(
                        bounds.x + bounds.width / 2,
                        bounds.bottom - 2,
                    );
                    return Boolean(topElement?.closest('[role="dialog"]'));
                } finally {
                    pointer.style.pointerEvents = previous;
                }
            });
        expect(dialogCoversPointer).toBe(true);
        await expect(dialog.locator('section').first()).toHaveCSS(
            'row-gap',
            '2px',
        );
        await expect(page.getByRole('tooltip')).toHaveCount(0);
        const firstStatue = dialog.getByRole('button', {
            name: 'Sealed Grounds Statue Unlock',
            exact: true,
        });
        await firstStatue.hover();
        await expect(
            page.getByRole('tooltip', {
                name: 'Sealed Grounds Statue Unlock',
                exact: true,
            }),
        ).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(page.getByRole('tooltip')).toHaveCount(0);
        await expect(
            dialog.getByRole('heading', { name: 'Faron', exact: true }),
        ).toBeVisible();
        await expect(
            dialog.getByRole('button', {
                name: 'Sealed Grounds Statue Unlock',
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            dialog.getByRole('button', {
                name: 'Deep Woods Statue Unlock',
                exact: true,
            }),
        ).toBeVisible();
        await expect(dialog.locator('[data-unlocked="true"]')).toHaveCount(2);
        await dialog
            .getByRole('button', {
                name: 'Lanayru Gorge Statue Unlock',
                exact: true,
            })
            .scrollIntoViewIfNeeded();
        await expect(
            dialog.getByRole('button', {
                name: 'Lanayru Gorge Statue Unlock',
                exact: true,
            }),
        ).toBeVisible();
        await page.screenshot({
            path: 'test-results/bird-statues-desktop.png',
            animations: 'disabled',
        });
        await page.setViewportSize({ width: 600, height: 720 });
        await expect(dialog).toBeVisible();
        await page.screenshot({
            path: 'test-results/bird-statues-small.png',
            animations: 'disabled',
        });
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        expect(errors).toEqual([]);
    });

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
