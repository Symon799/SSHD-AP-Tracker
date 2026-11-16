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
    test('groups signs, filters them, remembers expansion and synchronizes AP checks', async ({
        page,
    }) => {
        await connectToFixture(page, 'Vegetation Player');
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();
        const central = page.getByRole('button', {
            name: 'Central Skyloft',
            exact: true,
        });
        await central.click();
        const signs = page.getByLabel(/^Signs:/);
        await expect(signs).toHaveAttribute(
            'aria-label',
            'Signs: 0/7 checked, 7 accessible',
        );
        const group = signs.locator('..');
        await expect(group.locator('[data-vegetation-check]')).toHaveCount(0);
        await signs.click();
        await expect(group.locator('[data-vegetation-check]')).toHaveCount(7);
        await expect(
            group
                .locator('[data-vegetation-row]')
                .first()
                .locator('[data-vegetation-check]'),
        ).toHaveCount(2);
        const sign = page.getByRole('button', {
            name: 'Central Skyloft - Sign 1',
            exact: true,
        });
        await sign.hover();
        await expect(page.getByRole('tooltip')).toBeVisible();
        await page
            .getByRole('button', { name: 'Open Server and Tools' })
            .click();
        await page.getByPlaceholder('Enter a command here').fill('!demo-sign');
        await page.getByPlaceholder('Enter a command here').press('Enter');
        await page
            .getByRole('button', { name: 'Tracker', exact: true })
            .click();
        await central.click();
        await expect(signs).toHaveAttribute(
            'aria-label',
            'Signs: 1/7 checked, 6 accessible',
        );
        await expect(group).toHaveAttribute('open', '');
        await page
            .getByRole('button', { name: 'Checked', exact: true })
            .click();
        await expect(group.locator('[data-vegetation-check]')).toHaveCount(1);
        await expect(sign).toBeVisible();
        await page
            .getByRole('button', { name: 'Accessible', exact: true })
            .click();
        await expect(group.locator('[data-vegetation-check]')).toHaveCount(6);
        await expect(sign).toHaveCount(0);
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await expect(group.locator('[data-vegetation-check]')).toHaveCount(7);
        await signs.scrollIntoViewIfNeeded();
        await page.screenshot({
            path: 'test-results/sign-shuffle.png',
            animations: 'disabled',
        });
    });

    test('remembers expanded groups and both scroll positions across tools and regions', async ({
        page,
    }) => {
        await connectToFixture(page, 'Vegetation Player');
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();
        const central = page.getByRole('button', {
            name: 'Central Skyloft',
            exact: true,
        });
        await central.click();
        const grass = page.getByLabel(/^Grass:/);
        const trees = page.getByLabel(/^Trees:/);
        await grass.click();
        await trees.click();
        const inner = grass
            .locator('..')
            .locator('[data-vegetation-list] > div');
        await inner.evaluate((element) => {
            element.scrollTop = 90;
        });
        await expect
            .poll(() => inner.evaluate((element) => element.scrollTop))
            .toBe(90);
        const outer = page.getByTestId('location-scroll');
        await outer.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
        });
        const offset = await outer.evaluate((element) => element.scrollTop);
        expect(offset).toBeGreaterThan(0);
        await page
            .getByRole('button', { name: 'Open Server and Tools' })
            .click();
        await page
            .getByRole('button', { name: 'Tracker', exact: true })
            .click();
        await central.click();
        for (const summary of [grass, trees])
            await expect(summary.locator('..')).toHaveAttribute('open', '');
        await expect
            .poll(() => outer.evaluate((element) => element.scrollTop))
            .toBeCloseTo(offset, 0);
        await expect
            .poll(() => inner.evaluate((element) => element.scrollTop))
            .toBe(90);
        await page
            .getByRole('button', { name: 'Upper Skyloft', exact: true })
            .click();
        await central.click();
        await expect(trees.locator('..')).toHaveAttribute('open', '');
        await expect
            .poll(() => outer.evaluate((element) => element.scrollTop))
            .toBeCloseTo(offset, 0);
        await expect
            .poll(() => inner.evaluate((element) => element.scrollTop))
            .toBe(90);
        await page
            .getByRole('button', { name: 'Accessible', exact: true })
            .click();
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await expect
            .poll(() => outer.evaluate((element) => element.scrollTop))
            .toBeCloseTo(offset, 0);
        await expect
            .poll(() => inner.evaluate((element) => element.scrollTop))
            .toBe(90);
        await trees.click();
        await page
            .getByRole('button', { name: 'Upper Skyloft', exact: true })
            .click();
        await central.click();
        await expect(trees.locator('..')).not.toHaveAttribute('open', '');
    });

    test('groups grass and trees and updates counters from AP', async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await connectToFixture(page, 'Vegetation Player');
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();
        await page
            .getByRole('button', { name: 'Central Skyloft', exact: true })
            .click();
        const grass = page.getByLabel(/^Grass: 7\/26 checked/);
        const trees = page.getByLabel(/^Trees: 0\/10 checked/);
        await expect(grass).toBeVisible();
        await expect(trees).toBeVisible();
        await expect(grass.locator('..')).toHaveCSS(
            'border-top-style',
            'solid',
        );
        await expect(grass.locator('..')).toHaveCSS('border-top-width', '1px');
        const primaryCells = page
            .getByTestId('location-scroll')
            .locator(':scope > div > div')
            .first()
            .locator(':scope > div');
        const leftEdge = (await primaryCells.first().boundingBox())!.x;
        const lastCheck = (await primaryCells.last().boundingBox())!;
        for (const summary of [grass, trees]) {
            const bounds = (await summary.locator('..').boundingBox())!;
            expect(bounds.x).toBeCloseTo(leftEdge, 0);
            expect(bounds.x + bounds.width).toBeCloseTo(
                lastCheck.x + lastCheck.width,
                0,
            );
        }
        const titleBounds = await grass
            .locator(':scope > span > span')
            .nth(0)
            .boundingBox();
        const countBounds = await grass
            .locator(':scope > span > span')
            .nth(1)
            .boundingBox();
        expect(
            countBounds!.x - titleBounds!.x - titleBounds!.width,
        ).toBeLessThanOrEqual(12);
        await expect(page.locator('[data-vegetation-row]')).toHaveCount(0);
        await grass.click();
        await expect(
            page.locator('[data-vegetation-row]').first(),
        ).toBeVisible();
        const firstRow = page.locator('[data-vegetation-row]').first();
        await expect(firstRow.locator('[data-vegetation-check]')).toHaveCount(
            2,
        );
        const firstCell = await firstRow
            .locator('[data-vegetation-check]')
            .nth(0)
            .boundingBox();
        const secondCell = await firstRow
            .locator('[data-vegetation-check]')
            .nth(1)
            .boundingBox();
        expect(secondCell!.x).toBeGreaterThan(firstCell!.x + firstCell!.width);
        expect(Math.abs(secondCell!.y - firstCell!.y)).toBeLessThan(1);
        expect(
            await page.locator('[data-vegetation-row]').count(),
        ).toBeLessThan(15);
        await page
            .getByRole('button', { name: 'Checked', exact: true })
            .click();
        await expect(page.locator('[data-vegetation-check]')).toHaveCount(7);
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await page
            .getByRole('button', { name: 'Open Server and Tools' })
            .click();
        await page.getByPlaceholder('Enter a command here').fill('!demo-check');
        await page.getByPlaceholder('Enter a command here').press('Enter');
        await page
            .getByRole('button', { name: 'Tracker', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Central Skyloft', exact: true })
            .click();
        await expect(page.getByLabel(/^Grass: 8\/26 checked/)).toBeVisible();
        await trees.click();
        await expect(
            trees
                .locator('..')
                .locator('[data-vegetation-row]')
                .first()
                .locator('[data-vegetation-check]'),
        ).toHaveCount(2);
        await page
            .getByRole('button', {
                name: 'Central Skyloft - Tree 1',
                exact: true,
            })
            .scrollIntoViewIfNeeded();
        await page.screenshot({
            path: 'test-results/vegetation-bundles.png',
            animations: 'disabled',
        });
        await page.setViewportSize({ width: 850, height: 720 });
        const narrowGrass = page.getByLabel(/^Grass: 8\/26 checked/);
        await expect(narrowGrass.locator('..')).toHaveAttribute('open', '');
        for (const summary of [narrowGrass, trees]) {
            await expect(
                summary
                    .locator('..')
                    .locator('[data-vegetation-row]')
                    .first()
                    .locator('[data-vegetation-check]'),
            ).toHaveCount(2);
        }
        await narrowGrass.scrollIntoViewIfNeeded();
        await page.screenshot({
            path: 'test-results/vegetation-bundles-small.png',
            animations: 'disabled',
        });
        expect(errors).toEqual([]);
    });

    test('keeps thousands of blades collapsed and virtualizes each patch', async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await connectToFixture(page, 'Blade Player');
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();
        await page
            .getByRole('img', { name: 'Back to Sky', exact: true })
            .click();
        const province = page.getByRole('button', {
            name: 'Faron Province',
            exact: true,
        });
        await expect(province.locator('span').first()).toHaveText(/^\d{4,}$/);
        const textFits = await province
            .locator('span')
            .first()
            .evaluate(
                (element) => element.scrollWidth <= element.clientWidth + 1,
            );
        expect(textFits).toBe(true);
        await page
            .getByRole('button', { name: 'Skyloft', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Central Skyloft', exact: true })
            .click();
        await expect(
            page.getByLabel(/^Grass blades: 7\/363 checked/),
        ).toBeVisible();
        await expect(page.locator('[data-vegetation-row]')).toHaveCount(0);
        await page.getByLabel(/^Grass blades:/).click();
        await expect(page.locator('[data-vegetation-row]')).toHaveCount(0);
        const patch = page.getByLabel(
            /^Central Skyloft - Grass Patch 1: 7\/23 checked/,
        );
        await patch.click();
        expect(
            await page.locator('[data-vegetation-row]').count(),
        ).toBeLessThan(15);
        await page
            .getByRole('button', { name: 'Accessible', exact: true })
            .click();
        const blade = page.getByRole('button', {
            name: 'Central Skyloft - Grass Patch 1 - Blade 8',
            exact: true,
        });
        await expect(blade).toBeVisible();
        await blade.hover();
        await expect(page.getByRole('tooltip')).toBeVisible();
        await blade.click();
        await expect(
            page.getByLabel(/^Grass blades: 8\/363 checked/),
        ).toBeVisible();
        await expect(
            page.getByRole('button', {
                name: 'Central Skyloft - Grass Patch 1 - Blade 8',
                exact: true,
            }),
        ).toHaveCount(0);
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await page
            .getByRole('button', { name: 'Upper Skyloft', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Central Skyloft', exact: true })
            .click();
        await expect(
            page.getByLabel(/^Grass blades:/).locator('..'),
        ).toHaveAttribute('open', '');
        await expect(
            page.getByLabel(/^Central Skyloft - Grass Patch 1:/).locator('..'),
        ).toHaveAttribute('open', '');
        await page.screenshot({
            path: 'test-results/vegetation-blades-desktop.png',
            animations: 'disabled',
        });
        await page.setViewportSize({ width: 600, height: 720 });
        await expect(page.getByLabel(/^Grass blades:/)).toBeVisible();
        await page
            .getByLabel(/^Central Skyloft - Grass Patch 1:/)
            .scrollIntoViewIfNeeded();
        const patchGroup = page
            .getByLabel(/^Central Skyloft - Grass Patch 1:/)
            .locator('..');
        const narrowRow = patchGroup.locator('[data-vegetation-row]').first();
        await expect(narrowRow.locator('[data-vegetation-check]')).toHaveCount(
            2,
        );
        await expect(patchGroup).toHaveCSS('border-bottom-width', '1px');
        const groupBounds = await patchGroup.boundingBox();
        const rowBounds = await narrowRow.boundingBox();
        expect(rowBounds!.y).toBeGreaterThan(groupBounds!.y);
        expect(rowBounds!.y + rowBounds!.height).toBeLessThanOrEqual(
            groupBounds!.y + groupBounds!.height,
        );
        // No fixed-height padding beyond the wrapped label and check borders.
        const cell = narrowRow.locator('[data-vegetation-check]').first();
        const cellHeight = (await cell.boundingBox())!.height;
        const labelHeight = await cell
            .getByRole('button')
            .evaluate((element) => {
                const label = element.querySelector('span')!;
                return label.getBoundingClientRect().height;
            });
        expect(cellHeight).toBeLessThanOrEqual(
            Math.max(30, labelHeight + 2) + 1,
        );
        await page.screenshot({
            path: 'test-results/vegetation-blades-small.png',
            animations: 'disabled',
        });
        expect(errors).toEqual([]);
    });

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
        const statues = page.getByRole('button', { name: 'Bird Statues 2/28' });
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
        for (const item of [
            'Inside the Volcano Statue Unlock',
            'Inside the Fire Sanctuary Statue Unlock',
        ]) {
            const statue = dialog.getByRole('button', {
                name: item,
                exact: true,
            });
            await statue.scrollIntoViewIfNeeded();
            await expect(statue.locator('img')).toHaveAttribute(
                'src',
                /bird_statue\.png/,
            );
            await statue.click();
        }
        await expect(dialog.locator('[data-unlocked="true"]')).toHaveCount(4);
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
        await expect(
            page.getByRole('button', { name: 'Bird Statues 4/28' }),
        ).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('connects, launches the tracker, and renders the map', async ({
        page,
    }) => {
        await connectToFixture(page);

        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Launch New Tracker' }).click();

        await expect(page).toHaveURL(/\/tracker$/);
        await expect(page.getByLabel(/^Grass(?: blades)?:/)).toHaveCount(0);
        await expect(page.getByLabel(/^Trees:/)).toHaveCount(0);
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
