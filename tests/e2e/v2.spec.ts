import { expect, test, type Page } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { load } from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

// Legacy interaction scenarios retain their original, stable geographic fixture.
// The bundled-pack scenarios below exercise the actual contributor default.
let legacyArchive: Buffer | undefined;
test.beforeEach(async ({ page }, info) => {
    if (info.title.startsWith('V2 bundled')) {
        info.setTimeout(90_000);
        return;
    }
    await page.route('**/default-map-pack.zip.*', async (route) => {
        if (route.request().url().endsWith('.2')) {
            await route.fulfill({ body: '' });
            return;
        }
        if (!legacyArchive) {
            const manifest = fs.readFileSync('tests/e2e/v2-legacy-pack.json');
            const files: Record<string, Uint8Array> = { 'pack.json': manifest };
            for (const [id, image] of Object.entries({
                world: 'Sky',
                skyloft: 'Skyloft',
                faron: 'Faron',
                eldin: 'Eldin',
                lanayru: 'Lanayru',
            }))
                files[`images/${id}.png`] = fs.readFileSync(
                    `src/assets/maps/${image}.png`,
                );
            legacyArchive = Buffer.from(zipSync(files, { level: 1 }));
        }
        await route.fulfill({
            body: legacyArchive,
            contentType: 'application/zip',
        });
    });
});

test('V2 bundled pack preserves local edits and becomes the base for New pack', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await expect(
        page.getByRole('button', {
            name: 'Edit Knight Academy F1',
            exact: true,
        }),
    ).toBeVisible({ timeout: 30_000 });
    await page
        .getByRole('button', { name: 'Edit Skyloft', exact: true })
        .click();
    await page.getByLabel('Map name', { exact: true }).fill('My local Skyloft');
    await expect(
        page.getByRole('button', {
            name: 'Edit My local Skyloft',
            exact: true,
        }),
    ).toBeVisible();
    await expect
        .poll(async () =>
            page
                .getByRole('status')
                .filter({ hasText: 'Saved locally' })
                .count(),
        )
        .toBeGreaterThan(0);
    await page.reload();
    await expect(
        page.getByRole('button', {
            name: 'Edit My local Skyloft',
            exact: true,
        }),
    ).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (
            value: unknown,
            key?: IDBValidKey,
        ) {
            if (key === 'current-images')
                throw new Error('Rewrote unchanged pack images');
            return put.call(this, value, key);
        };
    });
    await page
        .getByRole('button', { name: 'Edit My local Skyloft', exact: true })
        .click();
    await page
        .getByLabel('Map name', { exact: true })
        .fill('My updated Skyloft');
    await expect(
        page.getByRole('status').filter({ hasText: 'Saved locally' }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole('button', {
            name: 'Edit My updated Skyloft',
            exact: true,
        }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'New pack', exact: true }).click();
    await page
        .getByRole('dialog', { name: 'New map pack' })
        .getByRole('button', { name: 'Create pack', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Edit Skyloft', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[aria-label="Maps"] > button')).toHaveCount(71);
    for (const name of [
        'Bug Heaven',
        'Lumpy Pumpkin',
        'Temple of Time',
        'LMF Boss Room',
        'Hall of Robots',
        'Deep Woods',
        'Fire Sanctuary F1',
    ])
        await expect(
            page.getByRole('button', { name: `Edit ${name}`, exact: true }),
        ).toHaveCount(1);
    await expect(
        page.getByRole('button', { name: 'Edit Sandship B3', exact: true }),
    ).toHaveCount(1);
});

test('V2 bundled pack import shows reading and completion status', async ({
    page,
}, info) => {
    let finishDownload!: () => void;
    const download = new Promise<void>((resolve) => {
        finishDownload = resolve;
    });
    await page.route('**/default-map-pack.zip.*', async (route) => {
        await download;
        await route.continue();
    });
    await page.goto('/v2/editor');
    await expect(page.getByRole('status')).toHaveText(
        'Loading default map pack…',
    );
    finishDownload();
    await expect(page.getByLabel('Import pack', { exact: true })).toBeEnabled({
        timeout: 30_000,
    });
    await page.evaluate(() => {
        const read = File.prototype.arrayBuffer;
        const control = window as typeof window & {
            finishPackRead?: () => void;
        };
        File.prototype.arrayBuffer = async function () {
            await new Promise<void>((resolve) => {
                control.finishPackRead = resolve;
            });
            return read.call(this);
        };
    });
    const archive = info.outputPath('default-map-pack.zip');
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    fs.writeFileSync(
        archive,
        Buffer.concat(
            [1, 2].map((part) =>
                fs.readFileSync(`src/v2/data/default-map-pack.zip.${part}`),
            ),
        ),
    );
    await page
        .getByLabel('Import pack', { exact: true })
        .setInputFiles(archive);
    const status = page.getByRole('status', { name: 'Pack import status' });
    await expect(status).toHaveText('Reading map pack…');
    await expect(
        page.getByLabel('Import pack', { exact: true }),
    ).toBeDisabled();
    await page.screenshot({ path: 'test-results/v2-pack-import-status.png' });
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    typeof (
                        window as typeof window & {
                            finishPackRead?: () => void;
                        }
                    ).finishPackRead,
            ),
        )
        .toBe('function');
    await page.evaluate(() =>
        (
            window as typeof window & { finishPackRead?: () => void }
        ).finishPackRead?.(),
    );
    // Allow the full archive to be decoded and saved to IndexedDB on CI.
    await expect(status).toHaveCount(0, { timeout: 30_000 });
    await expect(
        page.getByRole('status').filter({ hasText: 'Map pack imported.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Import pack', { exact: true })).toBeEnabled();
});

async function setMapZoom(page: Page, percent: number) {
    await page.getByRole('button', { name: 'Map zoom', exact: true }).click();
    const slider = page.getByRole('slider', { name: 'Zoom level' });
    await slider.fill(String(percent));
    await slider.press('Escape');
}

test('V2 bundled markers resize independently of zoom and keep their counts', async ({
    page,
}) => {
    await page.setViewportSize({ width: 940, height: 515 });
    await page.goto('/v2');
    await page
        .getByRole('combobox', { name: 'Offline preset' })
        .selectOption('all-blades');
    await page.locator('[data-marker-id="to-skyloft"]').click();
    await expect(
        page.getByTestId('map-stage').getByRole('img'),
    ).toHaveAttribute('alt', 'Skyloft');
    const sizes = () =>
        page
            .locator('[data-marker-id]')
            .evaluateAll((elements) =>
                elements.map(
                    (element) => element.getBoundingClientRect().width,
                ),
            );
    const small = await sizes();
    expect(Math.max(...small)).toBeLessThan(16);
    expect(Math.min(...small)).toBeGreaterThanOrEqual(6.25);
    await expect(
        page.locator('[data-count-visible="true"]').first(),
    ).toHaveText(/\d/);
    const markerSize = page.getByRole('button', {
        name: 'Marker size',
        exact: true,
    });
    await markerSize.click();
    const sizeSlider = page.getByRole('slider', {
        name: 'Marker size percentage',
    });
    await expect(sizeSlider).toHaveCSS('writing-mode', 'vertical-lr');
    const check = page.locator('[data-count-visible="true"]').first();
    const mapLink = page.getByRole('button', {
        name: 'Waterfall Cave',
        exact: true,
    });
    const ratio = async () =>
        (await check.boundingBox())!.width /
        (await mapLink.boundingBox())!.width;
    await expect.poll(ratio).toBeCloseTo(0.9, 2);
    await sizeSlider.fill('50');
    await expect.poll(ratio).toBeCloseTo(0.9, 2);
    await expect
        .poll(async () => Math.max(...(await sizes())))
        .toBeCloseTo(Math.max(...small) / 2, 1);
    await expect(
        page.locator('[data-count-visible="true"]').first(),
    ).toHaveText(/\d/);
    await expect(
        page.getByRole('button', { name: 'Map zoom', exact: true }),
    ).toHaveText('100%');
    await page.screenshot({ path: 'test-results/v2-marker-size-slider.png' });
    await sizeSlider.fill('100');
    await sizeSlider.press('Escape');
    await expect(sizeSlider).toHaveCount(0);
    await page.screenshot({ path: 'test-results/v2-dense-small.png' });
    await page
        .getByRole('button', { name: 'Waterfall Cave', exact: true })
        .click();
    await expect(
        page.getByTestId('map-stage').getByRole('img'),
    ).toHaveAttribute('alt', 'Waterfall Cave');
    await expect
        .poll(async () =>
            Math.abs(Math.max(...(await sizes())) - Math.max(...small)),
        )
        .toBeLessThan(0.1);
    await page.screenshot({
        path: 'test-results/v2-waterfall-marker-size.png',
    });
    await page
        .getByRole('button', { name: 'Previous map', exact: true })
        .click();
    await expect(
        page.getByTestId('map-stage').getByRole('img'),
    ).toHaveAttribute('alt', 'Skyloft');
    await setMapZoom(page, 350);
    await expect.poll(async () => Math.max(...(await sizes()))).toBe(38);
    await expect(
        page.locator('[data-count-visible="true"]').first(),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/v2-dense-zoom.png' });
    for (const [width, height] of [
        [2560, 1440],
        [1400, 900],
        [600, 820],
    ]) {
        await page.setViewportSize({ width, height });
        await page
            .getByRole('button', { name: 'Fit map', exact: true })
            .click();
        await expect(
            page.getByTestId('map-stage').getByRole('img'),
        ).toBeVisible();
        await page.screenshot({ path: `test-results/v2-dense-${width}.png` });
    }
});

test('V2 bundled short hovers stay beside the marker and inside the viewport', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1000, height: 600 });
    await page.goto('/v2');
    await page
        .getByRole('combobox', { name: 'Offline preset' })
        .selectOption('all-blades');
    await page.locator('[data-marker-id="to-skyloft"]').click();
    const point = page.locator(
        '[data-marker-id="17b58630-5094-480c-bd5c-12aff3da1844"]',
    );
    await point.hover();
    const popup = page.getByRole('dialog', {
        name: 'Multi-check',
        exact: true,
    });
    await expect(popup).toBeVisible();
    await expect
        .poll(async () => {
            const bounds = (await popup.boundingBox())!;
            const anchor = (await point.boundingBox())!;
            return Math.abs(
                bounds.y - Math.min(anchor.y, 600 - bounds.height - 12),
            );
        })
        .toBeLessThan(2);
    await page.screenshot({ path: 'test-results/v2-short-hover.png' });
    await popup.hover();
    await expect(popup.getByRole('button').first()).toBeVisible();
});

async function connectV2(page: Page, slot = 'Vegetation Player') {
    await page.goto('/v2/connect');
    await expect(
        page.getByRole('button', { name: 'Connect', exact: true }),
    ).toBeEnabled();
    await page.getByPlaceholder('archipelago.gg:XXXXX').fill('localhost:38281');
    await page.getByPlaceholder('Slot name').fill(slot);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Launch New Tracker' }),
    ).toBeEnabled();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Launch New Tracker' }).click();
}

test('V2 map associations filter, cancel, confirm transfers and undo atomically', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await page
        .getByRole('button', { name: 'Edit Skyloft', exact: true })
        .click();
    const summary = page.getByText(/^Player following: \d+ game areas$/);
    const before = await summary.textContent();
    await page.getByRole('button', { name: 'Configure associations' }).click();
    const dialog = page.getByRole('dialog', {
        name: 'Map associations: Skyloft',
        exact: true,
    });
    await expect(
        dialog.getByRole('button', { name: 'Close map associations' }),
    ).toBeInViewport();
    for (const tab of ['Player following', 'Entrance destinations']) {
        await dialog.getByRole('tab', { name: tab, exact: true }).click();
        await expect(
            dialog.getByRole('tab', { name: tab, exact: true }),
        ).toHaveAttribute('aria-selected', 'true');
        await expect
            .poll(() =>
                dialog
                    .getByRole('region', {
                        name: 'Selected associations',
                        exact: true,
                    })
                    .evaluate((element) => {
                        const list =
                            element.lastElementChild!.getBoundingClientRect();
                        const section = element.getBoundingClientRect();
                        return Math.abs(list.bottom - section.bottom);
                    }),
            )
            .toBeLessThan(2);
    }
    await dialog
        .getByRole('tab', { name: 'Player following', exact: true })
        .click();
    await dialog.getByLabel('Search associations').fill('F100');
    await dialog
        .getByRole('button', { name: 'Select filtered', exact: true })
        .click();
    await expect(
        dialog.getByRole('button', { name: 'Apply Changes', exact: true }),
    ).toBeEnabled();
    await dialog
        .getByRole('button', { name: 'Close map associations', exact: true })
        .click();
    const confirmation = page.getByRole('dialog', {
        name: 'You have unapplied changes.',
        exact: true,
    });
    await expect(
        confirmation.getByRole('region', { name: 'Association transfers' }),
    ).toContainText('From Faron Province to Skyloft');
    await expect(confirmation.getByRole('heading')).toHaveCSS(
        'text-align',
        'center',
    );
    await expect(confirmation.getByRole('button')).toHaveText([
        'Apply & close',
        'Keep editing',
        'Discard & close',
    ]);
    await expect(
        confirmation.getByRole('button', { name: 'Apply & close' }),
    ).toBeEnabled();
    await confirmation.getByRole('button', { name: 'Keep editing' }).click();
    await expect(
        dialog.getByRole('checkbox', {
            name: 'Confirm transfers',
            exact: true,
        }),
    ).toHaveCount(0);
    await dialog
        .getByRole('button', { name: 'Discard Changes', exact: true })
        .click();
    await expect(dialog.getByRole('status')).toHaveText('No pending changes');
    await expect(dialog).toBeVisible();
    await expect(summary).toHaveText(before!);
    await dialog.getByLabel('Game area region').selectOption('Faron');
    await dialog.getByLabel('Search associations').fill('F100');
    await dialog
        .getByRole('button', { name: 'Select filtered', exact: true })
        .click();
    await dialog
        .getByRole('button', { name: 'Clear selection', exact: true })
        .click();
    await expect(
        dialog.getByRole('button', { name: 'Apply Changes', exact: true }),
    ).toBeDisabled();
    await dialog
        .getByRole('button', { name: 'Select filtered', exact: true })
        .click();
    await page.screenshot({ path: 'test-results/v2-associations-desktop.png' });
    await expect(
        dialog.getByRole('button', { name: 'Apply Changes', exact: true }),
    ).toBeInViewport();
    await page.setViewportSize({ width: 600, height: 820 });
    await expect(dialog).toBeVisible();
    await expect(
        dialog.getByRole('button', { name: 'Apply Changes', exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: 'test-results/v2-associations-mobile.png' });
    await dialog
        .getByRole('button', { name: 'Apply Changes', exact: true })
        .click();
    const review = page.getByRole('dialog', {
        name: 'Review association transfers',
        exact: true,
    });
    await expect(
        review.getByRole('region', { name: 'Association transfers' }),
    ).toContainText('Faron');
    await expect(review.getByRole('checkbox')).toHaveCount(0);
    await expect(review.getByRole('button')).toHaveText([
        'Apply Change',
        'Keep editing',
        'Discard Changes',
    ]);
    await expect(summary).toHaveText(before!);
    await review.getByRole('button', { name: 'Keep editing' }).click();
    await dialog
        .getByRole('button', { name: 'Apply Changes', exact: true })
        .click();
    await review
        .getByRole('button', { name: 'Discard Changes', exact: true })
        .click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText('No pending changes');
    await expect(summary).toHaveText(before!);
    await dialog
        .getByRole('button', { name: 'Select filtered', exact: true })
        .click();
    await dialog
        .getByRole('button', { name: 'Apply Changes', exact: true })
        .click();
    await review.evaluate((element) =>
        Promise.all(
            element.getAnimations().map((animation) => animation.finished),
        ),
    );
    await page.screenshot({
        path: 'test-results/v2-transfer-confirmation-mobile.png',
    });
    await review
        .getByRole('button', { name: 'Apply Change', exact: true })
        .click();
    await expect(review).not.toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText('No pending changes');
    await expect(summary).not.toHaveText(before!);
    await dialog
        .getByRole('button', { name: 'Clear selection', exact: true })
        .click();
    await expect(dialog.getByRole('status')).toHaveText('Unapplied changes');
    await dialog
        .getByRole('button', { name: 'Discard Changes', exact: true })
        .click();
    await expect(dialog.getByRole('status')).toHaveText('No pending changes');
    await expect(
        dialog.getByRole('checkbox', {
            name: 'Faron Woods (F100)',
            exact: true,
        }),
    ).toBeChecked();
    await dialog
        .getByRole('button', { name: 'Close map associations', exact: true })
        .click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(summary).toHaveText(before!);
});

test('V2 association close protection handles Escape, backdrop, discard and apply', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await page
        .getByRole('button', { name: 'Edit Skyloft', exact: true })
        .click();
    const summary = page.getByText(/^Player following: \d+ game areas$/);
    const before = await summary.textContent();
    const open = page.getByRole('button', { name: 'Configure associations' });
    const dialog = page.getByRole('dialog', {
        name: 'Map associations: Skyloft',
        exact: true,
    });
    const confirmation = page.getByRole('dialog', {
        name: 'You have unapplied changes.',
        exact: true,
    });
    await open.click();
    await dialog.getByLabel('Search associations').fill('F000');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(confirmation).not.toBeVisible();
    await open.click();
    await dialog.getByLabel('Search associations').fill('F000');
    const sky = dialog.getByRole('checkbox', {
        name: 'Skyloft (F000)',
        exact: true,
    });
    await expect(sky).toBeChecked();
    await sky.uncheck();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirmation).not.toBeVisible();
    await expect(sky).not.toBeChecked();
    await page.mouse.click(5, 5);
    await expect(confirmation).toBeVisible();
    const keepEditing = confirmation.getByRole('button', {
        name: 'Keep editing',
    });
    await expect
        .poll(() =>
            keepEditing.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                const top = document.elementFromPoint(
                    rect.x + rect.width / 2,
                    rect.y + rect.height / 2,
                );
                return top !== null && element.contains(top);
            }),
        )
        .toBe(true);
    await confirmation.evaluate((element) =>
        Promise.all(
            element.getAnimations().map((animation) => animation.finished),
        ),
    );
    await page.screenshot({
        path: 'test-results/v2-unapplied-associations.png',
    });
    await confirmation.getByRole('button', { name: 'Discard & close' }).click();
    await expect(summary).toHaveText(before!);
    await open.click();
    await dialog.getByLabel('Search associations').fill('F000');
    await expect(sky).toBeChecked();
    await sky.uncheck();
    await dialog
        .getByRole('button', { name: 'Close map associations' })
        .click();
    await confirmation.getByRole('button', { name: 'Apply & close' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(summary).not.toHaveText(before!);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(summary).toHaveText(before!);
});

test('V2 follows Rust DataStorage on login and notifications without position subscriptions', async ({
    page,
}) => {
    const packets: Array<{ cmd: string; keys?: string[] }> = [];
    page.on('websocket', (socket) =>
        socket.on('framesent', ({ payload }) => {
            if (typeof payload === 'string')
                packets.push(...JSON.parse(payload));
        }),
    );
    await connectV2(page, 'Rust Player');
    const follow = page.getByRole('button', {
        name: 'Follow player',
        exact: true,
    });
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page.getByRole('region', { name: 'Map: Faron Province', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'World map', exact: true }).click();
    await follow.click({ button: 'right' });
    await expect(
        page.getByRole('region', { name: 'Map: Faron Province', exact: true }),
    ).toBeVisible();
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'World map', exact: true }).click();
    await follow.click();
    await follow.click();
    await expect(
        page.getByRole('region', { name: 'Map: Faron Province', exact: true }),
    ).toBeVisible();
    await follow.click();
    await page.getByRole('button', { name: 'World map', exact: true }).click();
    await follow.click({ button: 'right' });
    await expect(
        page.getByRole('region', { name: 'Map: Faron Province', exact: true }),
    ).toBeVisible();
    await expect(follow).toHaveAttribute('aria-pressed', 'false');
    await follow.click();
    expect(
        packets.some(
            (p) =>
                p.cmd === 'Get' &&
                p.keys?.includes('sshd_rs_SSHD-E2E-SEED_1_tracker_location'),
        ),
    ).toBe(true);
    expect(
        packets.some((p) =>
            p.keys?.some((key) => key.endsWith('_tracker_position')),
        ),
    ).toBe(false);
    await sendTelemetryCommand(page, '!demo-rust-stage F200');
    await expect(
        page.getByRole('region', { name: 'Map: Eldin Province', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-rust-clear');
    await expect(
        page.getByRole('region', { name: 'Map: Eldin Province', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-rust-stage F000');
    await expect(
        page.getByRole('region', { name: 'Map: Skyloft', exact: true }),
    ).toBeVisible();
    await follow.click();
    await page.reload();
    await expect(follow).toHaveAttribute('aria-pressed', 'false');
});

test('V2 offline presets are isolated from saved settings and hidden for AP sessions', async ({
    page,
}) => {
    await page.goto('/v2');
    const presets = page.getByRole('combobox', { name: 'Offline preset' });
    await expect(presets).toBeVisible();
    const before = await page.evaluate(() => ({ ...localStorage }));
    await presets.selectOption('all-blades');
    await expect(presets).toHaveValue('all-blades');
    await expect(
        page.getByText('Remaining', { exact: false }).first(),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/offline-presets-desktop.png' });
    await page.setViewportSize({ width: 600, height: 800 });
    await expect(presets).toBeVisible();
    await page.screenshot({ path: 'test-results/offline-presets-narrow.png' });
    await presets.selectOption('saved');
    const after = await page.evaluate(() => ({ ...localStorage }));
    for (const key of Object.keys(before).filter((key) =>
        /tracker/i.test(key),
    )) {
        expect(after[key]).toBe(before[key]);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await connectV2(page);
    await expect(presets).toHaveCount(0);
});

async function findHoverCheck(
    popup: import('@playwright/test').Locator,
    name: string,
) {
    const scroll = popup.locator('[data-vegetation-list] > div');
    await scroll.evaluate((el) => {
        el.scrollTop = 0;
    });
    const check = popup.getByRole('button', { name, exact: true });
    for (let step = 0; step < 100; step++) {
        if (await check.count()) {
            await check.evaluate((element) => {
                const viewport = element.closest(
                    '[data-vegetation-list]',
                )!.firstElementChild!;
                const row = element.getBoundingClientRect();
                const bounds = viewport.getBoundingClientRect();
                if (row.top < bounds.top)
                    viewport.scrollTop -= bounds.top - row.top;
                else if (row.bottom > bounds.bottom)
                    viewport.scrollTop += row.bottom - bounds.bottom;
            });
            return check;
        }
        const more = await scroll.evaluate((el) => {
            const before = el.scrollTop;
            el.scrollTop += 220;
            return el.scrollTop > before;
        });
        if (!more) break;
        await popup.page().waitForTimeout(25);
    }
    await expect(check).toBeVisible();
    return check;
}

async function sendTelemetryCommand(
    page: Page,
    command: string,
    ignored = false,
) {
    await page
        .getByRole('button', { name: 'Server & Tools', exact: true })
        .click();
    const debugOff = page.getByRole('button', {
        name: 'Debug Off',
        exact: true,
    });
    if (await debugOff.count()) await debugOff.click();
    const diagnostics = page.getByRole('region', {
        name: 'Player tracking diagnostics',
        exact: true,
    });
    const field = command.startsWith('!demo-rust')
        ? /^Location:/
        : /^Sequence:/;
    const before = await diagnostics.getByText(field).textContent();
    await page.getByPlaceholder('Enter a command here').fill(command);
    await page.getByPlaceholder('Enter a command here').press('Enter');
    if (ignored)
        await expect(diagnostics).toContainText('Ignored invalid telemetry');
    else await expect(diagnostics.getByText(field)).not.toHaveText(before!);
    await page.getByRole('button', { name: 'Tracker', exact: true }).click();
}

const marker = (page: Page, name: string) =>
    page.getByTestId('map-stage').getByRole('button', { name, exact: true });

function manualEntranceFixture() {
    const dump = load(fs.readFileSync('testData/sshd-dump.yaml', 'utf8')) as {
        exits: Record<string, { short_name: string }>;
        entrances: Record<string, { short_name: string }>;
        checks: Record<string, { short_name: string }>;
    };
    const idFor = (
        entries: Record<string, { short_name: string }>,
        name: string,
    ) => {
        const id = Object.keys(entries).find(
            (id) => entries[id].short_name === name,
        );
        if (!id) throw new Error(name);
        return id;
    };
    const exit = idFor(dump.exits, 'Deep Woods -> Skyview Temple');
    const arrivalA = idFor(dump.entrances, 'Deep Woods -> Skyview Temple');
    const arrivalB = idFor(dump.entrances, 'Eldin Volcano -> Earth Temple');
    const sign = idFor(dump.checks, 'Central Skyloft - Sign 1');
    const sign2 = idFor(dump.checks, 'Central Skyloft - Sign 2');
    const bell = idFor(dump.checks, 'Upper Skyloft - Ring Knight Academy Bell');
    const pack = {
        version: 1,
        id: 'manual-entrance-demo',
        name: 'Manual entrance demo',
        maps: [
            {
                id: 'root',
                name: 'Door Map',
                image: 'images/map.png',
                width: 843,
                height: 465,
                entranceIds: [],
                markers: [
                    {
                        id: 'door',
                        kind: 'link',
                        label: 'Dungeon Door',
                        x: 400,
                        y: 200,
                        targetMapId: 'skyview',
                        navigation: 'child',
                    },
                ],
            },
            {
                id: 'skyview',
                name: 'Skyview Map',
                image: 'images/map.png',
                width: 843,
                height: 465,
                entranceIds: [],
                markers: [
                    {
                        id: 'signs',
                        kind: 'checks',
                        label: 'Signs',
                        x: 300,
                        y: 200,
                        checkIds: [sign, sign2],
                    },
                ],
            },
            {
                id: 'earth',
                name: 'Earth Temple Map',
                image: 'images/map.png',
                width: 843,
                height: 465,
                entranceIds: [],
                markers: [
                    {
                        id: 'bell',
                        kind: 'checks',
                        label: 'Bell',
                        x: 300,
                        y: 200,
                        checkIds: [bell],
                    },
                ],
            },
        ],
    };
    return { pack, exit, arrivalA, arrivalB };
}

async function importManualEntranceFixture(page: Page, pack: unknown) {
    await page.getByLabel('Import pack', { exact: true }).setInputFiles({
        name: 'manual-entrances.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from(
            zipSync({
                'pack.json': strToU8(JSON.stringify(pack)),
                'images/map.png': fs.readFileSync('src/assets/maps/Faron.png'),
            }),
        ),
    });
    await expect(page.getByLabel('Pack name', { exact: true })).toHaveValue(
        'Manual entrance demo',
    );
    await expect(
        page.getByRole('status').filter({ hasText: 'Map pack imported.' }),
    ).toBeVisible();
}

test('V2 catalogue fills the remaining height down to the placement controls', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto('/v2/editor');
    const left = page.locator('aside').first();
    await left
        .getByRole('checkbox', { name: 'Unplaced', exact: true })
        .uncheck();
    const viewport = left
        .locator('[data-catalogue-row]')
        .first()
        .locator('../..');
    const place = left.getByRole('button', {
        name: 'Place selected checks',
        exact: true,
    });
    const gap = async () => {
        const list = (await viewport.boundingBox())!,
            button = (await place.boundingBox())!;
        return Math.round(button.y - list.y - list.height);
    };
    await expect.poll(gap).toBeLessThanOrEqual(10);
    expect((await viewport.boundingBox())!.height).toBeGreaterThan(340);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await expect.poll(gap).toBeLessThanOrEqual(10);
    await page.screenshot({
        path: 'test-results/v2-catalogue-fill.png',
        animations: 'disabled',
    });
});

test('V2 Entrance Player exposes entrances and switches to the shared V1 tools page without moving footer controls', async ({
    page,
}) => {
    await connectV2(page, 'Entrance Player');
    const entrance = page.getByRole('button', {
        name: 'Entrances',
        exact: true,
    });
    await expect(entrance).toBeVisible();
    const canvas = page.getByRole('region', {
        name: 'Map: The Sky',
        exact: true,
    });
    await expect(
        canvas.getByRole('button', { name: 'Entrances', exact: true }),
    ).toBeVisible();
    await entrance.click();
    const dialog = page.getByRole('dialog', { name: 'Entrances', exact: true });
    await expect(dialog.getByPlaceholder('Search exits')).toBeVisible();
    await expect(
        dialog.getByText('No randomized entrances for this seed.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        dialog.getByRole('button', { name: 'Go to', exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({
        path: 'test-results/v2-entrances.png',
        animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    const footer = page.locator('footer');
    const controls = footer.getByRole('navigation', {
        name: 'Tracker navigation',
        exact: true,
    });
    const pack = page
        .getByRole('banner')
        .getByText('SSHD · V1 Map Layout', { exact: true });
    const connection = footer.getByText(/Connected to .*Entrance Player/);
    expect((await controls.boundingBox())!.x).toBeLessThan(
        (await connection.boundingBox())!.x,
    );
    await expect(pack).toBeVisible();
    const editor = page.getByRole('link', { name: 'Map Editor', exact: true });
    expect((await pack.boundingBox())!.x).toBeLessThan(
        (await editor.boundingBox())!.x,
    );
    await expect(
        footer.getByText('SSHD · V1 Map Layout', { exact: true }),
    ).toHaveCount(0);
    const controlsBefore = (await controls.boundingBox())!;
    const connectionBefore = (await connection.boundingBox())!;
    const mapBounds = (await canvas.boundingBox())!;
    const footerBounds = (await footer.boundingBox())!;
    expect(footerBounds.x + footerBounds.width).toBeLessThan(mapBounds.x);
    expect(mapBounds.y + mapBounds.height).toBeGreaterThan(
        footerBounds.y + footerBounds.height,
    );
    await controls
        .getByRole('button', { name: 'Server & Tools', exact: true })
        .click();
    const tools = page.getByRole('region', {
        name: 'Server & Tools',
        exact: true,
    });
    await expect(tools).toBeVisible();
    const bounds = (await tools.boundingBox())!;
    expect(bounds.width).toBeGreaterThan(page.viewportSize()!.width * 0.94);
    expect(bounds.height).toBeGreaterThan(page.viewportSize()!.height * 0.7);
    const controlsAfter = (await controls.boundingBox())!;
    const connectionAfter = (await connection.boundingBox())!;
    expect(controlsAfter.x).toBe(controlsBefore.x);
    expect(controlsAfter.y).toBe(controlsBefore.y);
    expect(connectionAfter.x).toBe(connectionBefore.x);
    expect(connectionAfter.y).toBe(connectionBefore.y);
    await expect(tools.getByText('Session', { exact: true })).toBeVisible();
    await expect(tools.getByText('Tools', { exact: true })).toBeVisible();
    await expect(tools.getByText('Server Log', { exact: true })).toBeVisible();
    await page.screenshot({
        path: 'test-results/v2-tools-expanded.png',
        animations: 'disabled',
    });
    await footer.getByRole('button', { name: 'Tracker', exact: true }).click();
    await expect(tools).toHaveCount(0);
});

test('V2 editor initially fits six maps, compacts controls and dims its sticky header under dialogs', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('/v2/editor');
    const dump = load(fs.readFileSync('testData/sshd-dump.yaml', 'utf8')) as {
        checks: Record<string, unknown>;
    };
    const maps = Array.from({ length: 8 }, (_, index) => ({
        id: `map-${index}`,
        name: `Map ${index + 1}`,
        image: 'images/map.png',
        width: 843,
        height: 465,
        entranceIds: [],
        markers:
            index === 0
                ? [
                      {
                          id: 'group',
                          kind: 'checks',
                          label: 'Test group',
                          x: 200,
                          y: 200,
                          checkIds: Object.keys(dump.checks).slice(0, 2),
                      },
                  ]
                : [],
    }));
    await page.getByLabel('Import pack', { exact: true }).setInputFiles({
        name: 'eight-maps.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from(
            zipSync({
                'pack.json': strToU8(
                    JSON.stringify({
                        version: 1,
                        id: 'eight-maps',
                        name: 'Eight maps',
                        maps,
                    }),
                ),
                'images/map.png': fs.readFileSync('src/assets/maps/Faron.png'),
            }),
        ),
    });
    const list = page.getByRole('navigation', { name: 'Maps', exact: true });
    for (let i = 1; i <= 6; i++)
        await expect(
            list.getByRole('button', { name: `Edit Map ${i}`, exact: true }),
        ).toBeInViewport({ ratio: 1 });
    await expect(
        list.getByRole('button', { name: 'Edit Map 7', exact: true }),
    ).not.toBeInViewport({ ratio: 1 });
    const initial = await page
        .getByRole('separator', { name: 'Resize maps and check catalogue' })
        .getAttribute('aria-valuenow');
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Test group' });
    const right = page.locator('aside').last();
    const left = page.locator('aside').first();
    await expect(
        right.getByRole('heading', { name: 'Type: Multi-check', exact: true }),
    ).toHaveCSS('font-size', '13px');
    await expect(
        right.getByRole('heading', { name: 'Type: Multi-check', exact: true }),
    ).toHaveCSS('font-weight', '700');
    await expect(right.locator('[class*="memberList"]')).toHaveCSS(
        'height',
        '228px',
    );
    const controls = [
        left.getByLabel('Search catalogue'),
        left.getByRole('button', { name: 'Select all', exact: true }),
        left.getByRole('button', { name: 'Clear', exact: true }),
    ];
    const centers = await Promise.all(
        controls.map(async (control) => {
            const box = (await control.boundingBox())!;
            return box.y + box.height / 2;
        }),
    );
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
    const search = (await left.getByLabel('Search catalogue').boundingBox())!;
    const region = (await left.getByLabel('Catalogue region').boundingBox())!;
    const unplaced = (await left
        .getByRole('checkbox', { name: 'Unplaced', exact: true })
        .boundingBox())!;
    expect(search.width).toBe(region.width);
    expect(
        Math.abs(
            region.y + region.height / 2 - unplaced.y - unplaced.height / 2,
        ),
    ).toBeLessThanOrEqual(2);
    const packName = (await page
        .getByLabel('Pack name', { exact: true })
        .boundingBox())!;
    const newPack = (await page
        .getByRole('button', { name: 'New pack', exact: true })
        .boundingBox())!;
    expect(
        Math.abs(packName.y + packName.height - newPack.y - newPack.height),
    ).toBeLessThanOrEqual(2);
    await expect(
        right.getByRole('button', { name: 'Delete multi-check', exact: true }),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'New map', exact: true }).click();
    await expect(
        page.getByRole('dialog', { name: 'New map', exact: true }),
    ).toBeVisible();
    await expect
        .poll(() =>
            page.locator('[class*="selectionHeader"]').evaluate((header) => {
                const box = header.getBoundingClientRect();
                const top = document.elementFromPoint(box.x + 20, box.y + 20);
                return top !== null && !header.contains(top);
            }),
        )
        .toBe(true);
    await page.screenshot({
        path: 'test-results/v2-editor-modal-overlay.png',
        animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
        page.getByRole('status').filter({ hasText: 'Saved locally' }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole('separator', {
            name: 'Resize maps and check catalogue',
        }),
    ).toHaveAttribute('aria-valuenow', initial!);
});

test('V2 reuses the compact V1 counters and keeps hover notes close to their title', async ({
    page,
}) => {
    await connectV2(page);
    await page.getByRole('link', { name: 'Map Editor', exact: true }).click();
    await page
        .getByRole('button', { name: 'Edit Skyloft', exact: true })
        .click();
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Central Skyloft' });
    await page
        .getByLabel('Location note', { exact: true })
        .fill('Right below the title.');
    await page
        .getByRole('link', { name: 'Preview Tracker', exact: true })
        .click();
    const counters = page.locator('aside [class*="countersCompact"]').first();
    await expect(counters).toBeVisible();
    const divider = page.getByRole('separator', {
        name: 'Resize left panel',
        exact: true,
    });
    await divider.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    const rows = () =>
        counters
            .locator('[class*="compactPair"]')
            .evaluateAll(
                (entries) =>
                    new Set(
                        entries.map((entry) =>
                            Math.round(entry.getBoundingClientRect().y),
                        ),
                    ).size,
            );
    await expect.poll(rows).toBe(1);
    await divider.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
    await expect.poll(rows).toBeGreaterThan(1);
    await marker(page, 'Skyloft').click();
    await marker(page, 'Central Skyloft').hover();
    const popup = page.getByRole('dialog', {
        name: 'Central Skyloft',
        exact: true,
    });
    const title = (await popup
        .getByText('Central Skyloft', { exact: true })
        .boundingBox())!;
    const note = (await popup
        .getByText('Right below the title.', { exact: true })
        .boundingBox())!;
    const check = (await popup
        .locator('[data-vegetation-check]')
        .first()
        .boundingBox())!;
    expect(note.y - title.y - title.height).toBeGreaterThanOrEqual(0);
    expect(note.y - title.y - title.height).toBeLessThanOrEqual(6);
    expect(check.y - note.y - note.height).toBeGreaterThanOrEqual(0);
    expect(check.y - note.y - note.height).toBeLessThanOrEqual(8);
    await page.screenshot({
        path: 'test-results/v2-hover-note.png',
        animations: 'disabled',
    });
});

test('V2 footer connects to AP and tools expose session, state files, diagnostics and relevant customization', async ({
    page,
}) => {
    await page.goto('/v2');
    const footer = page.getByRole('navigation', {
        name: 'Tracker navigation',
        exact: true,
    });
    await footer.getByRole('link', { name: 'Connect', exact: true }).click();
    await expect(page).toHaveURL(/\/v2\/connect$/);
    await expect(
        page.getByRole('button', { name: 'Connect', exact: true }),
    ).toBeEnabled();
    await page.getByPlaceholder('archipelago.gg:XXXXX').fill('localhost:38281');
    await page.getByPlaceholder('Slot name').fill('Vegetation Player');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Launch New Tracker' }),
    ).toBeEnabled();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Launch New Tracker' }).click();
    await expect(page).toHaveURL(/\/v2$/);
    await footer
        .getByRole('button', { name: 'Server & Tools', exact: true })
        .click();
    const tools = page.getByRole('region', {
        name: 'Server & Tools',
        exact: true,
    });
    await expect(
        tools.getByText('Checked Locations: 8', { exact: true }),
    ).toBeVisible();
    await expect(tools.getByText(/^Total Locations: [1-9]\d*$/)).toBeVisible();
    await expect(tools.getByText(/^Completion: \d+\.\d%$/)).toBeVisible();
    const downloadEvent = page.waitForEvent('download');
    await tools
        .getByRole('button', { name: 'Export State', exact: true })
        .click();
    const stateFile = (await (await downloadEvent).path())!;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(state.version).toBe('SSHD-TRACKER-STATE-V1');
    expect(state).not.toHaveProperty('pack');
    await tools.locator('input[type="file"]').setInputFiles(stateFile);
    await tools.getByRole('button', { name: 'Debug Off', exact: true }).click();
    await expect(
        tools.getByRole('button', { name: 'Snapshot', exact: true }),
    ).toBeVisible();
    await expect(
        tools.getByRole('button', { name: 'AP Server Data', exact: true }),
    ).toBeVisible();
    await tools
        .getByRole('button', { name: 'Customization', exact: true })
        .click();
    const customization = page.getByRole('dialog', {
        name: 'Tracker Customization',
        exact: true,
    });
    await expect(
        customization.getByLabel('Item Layout', { exact: true }),
    ).toHaveCount(0);
    await expect(
        customization.getByText('Automatically follow current region (AP)', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        customization.getByRole('checkbox', {
            name: 'Show Trick Logic',
            exact: true,
        }),
    ).toBeVisible();
    const background = () =>
        page.evaluate(() =>
            getComputedStyle(document.body).getPropertyValue(
                '--scheme-background',
            ),
        );
    const light = await background();
    await customization
        .getByRole('button', { name: 'Dark', exact: true })
        .click();
    await expect.poll(background).not.toBe(light);
    await customization
        .getByRole('button', { name: 'Light', exact: true })
        .click();
    await page.keyboard.press('Escape');
    await expect(tools).toBeVisible();
    await tools.getByPlaceholder('Enter a command here').fill('!demo-sign');
    await tools.getByPlaceholder('Enter a command here').press('Enter');
    await expect(
        tools.getByText('Checked Locations: 9', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: 'test-results/v2-tools.png',
        animations: 'disabled',
    });
    await footer.getByRole('button', { name: 'Tracker', exact: true }).click();
    await footer.getByRole('link', { name: 'Connect', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Disconnect', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: /^Continue Tracker/ }).click();
    await expect(page).toHaveURL(/\/v2$/);
    await footer
        .getByRole('button', { name: 'Server & Tools', exact: true })
        .click();
    await expect(
        tools.getByText('Checked Locations: 9', { exact: true }),
    ).toBeVisible();
});

test('V2 editor keeps the active map visible in its own list and compacts the inspector', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    const maps = page.getByRole('navigation', { name: 'Maps', exact: true });
    const selection = page.getByLabel('Select check or link', { exact: true });
    await expect(selection).toBeVisible();
    await expect(page.getByLabel('Edit map', { exact: true })).toHaveCount(0);
    const activeVisible = async () => {
        await expect
            .poll(() =>
                maps.evaluate((list) => {
                    const active = list.querySelector('[aria-pressed="true"]');
                    if (!active) return false;
                    const item = active.getBoundingClientRect(),
                        viewport = list.getBoundingClientRect();
                    return (
                        item.top >= viewport.top - 1 &&
                        item.bottom <= viewport.bottom + 1
                    );
                }),
            )
            .toBe(true);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
    };
    await maps.evaluate((list) => {
        list.scrollTop = list.scrollHeight;
    });
    await selection.selectOption({ label: 'Skyloft' });
    await activeVisible();
    await expect(
        page.getByRole('heading', { name: 'Type: Map link', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Create map link', exact: true }),
    ).toHaveCSS('font-weight', '700');
    await marker(page, 'Lanayru Province').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Go to map' }).click();
    await activeVisible();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Lanayru Province',
    );
    await maps.evaluate((list) => {
        list.scrollTop = 0;
    });
    await selection.selectOption({ label: 'Back to Sky' });
    await activeVisible();
    // Selecting the same point again must reveal the map as well.
    await maps.evaluate((list) => {
        list.scrollTop = 0;
    });
    await marker(page, 'Back to Sky').click();
    await activeVisible();
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    await selection.selectOption({ label: 'Faron Woods' });
    await activeVisible();
    const inspector = page.locator('aside').last();
    await expect(
        inspector.getByRole('heading', {
            name: 'Type: Multi-check',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        inspector.getByRole('heading', {
            name: 'Current selection',
            exact: true,
        }),
    ).toHaveCSS('font-size', '16px');
    const x = (await inspector.getByLabel('X', { exact: true }).boundingBox())!;
    const y = (await inspector.getByLabel('Y', { exact: true }).boundingBox())!;
    expect(Math.abs(x.y - y.y)).toBeLessThanOrEqual(1);
    const note = inspector.getByLabel('Location note', { exact: true });
    await expect(note).toHaveCSS('height', '40px');
    await note.fill('Near the waterfall entrance.');
    await page
        .getByRole('img', { name: 'Faron Province', exact: true })
        .evaluate(async (image: HTMLImageElement) => image.decode());
    await page.screenshot({
        path: 'test-results/v2-inspector-header.png',
        animations: 'disabled',
    });
    await page
        .getByRole('link', { name: 'Preview Tracker', exact: true })
        .click();
    await expect(
        page.getByRole('banner').getByText('The Sky', { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('heading', { name: 'The Sky', exact: true }),
    ).toHaveCount(1);
    await marker(page, 'Faron Province').click();
    await marker(page, 'Faron Woods').hover();
    await expect(
        page
            .getByRole('dialog', { name: 'Faron Woods', exact: true })
            .getByText('Near the waterfall entrance.', { exact: true }),
    ).toBeVisible();
});

test('V2 editor selection distinguishes background clicks from panning and separates group actions', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await expect(marker(page, 'Faron Province')).toHaveAttribute(
        'data-status',
        'available',
    );
    await expect(marker(page, 'Faron Province')).toHaveCSS(
        'background-color',
        'rgb(98, 201, 133)',
    );
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    const selection = page.getByLabel('Select check or link', { exact: true });
    await selection.selectOption({ label: 'Faron Woods' });
    const inspector = page.locator('aside').last();
    await expect(
        inspector.getByRole('heading', {
            name: 'Current selection',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByPlaceholder('Find a check or link on this map'),
    ).toHaveCount(0);
    await expect(page.getByLabel('Merge target')).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Merge checks', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Map properties', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByText('Pack issues (0)', { exact: true }),
    ).toHaveCount(0);
    const nameToggle = inspector.getByRole('checkbox', {
        name: 'Show name on hover',
        exact: true,
    });
    await expect(nameToggle).toBeChecked();
    await nameToggle.uncheck();
    const members = (await inspector
        .locator('[class*="memberList"]')
        .boundingBox())!;
    const create = (await inspector
        .getByRole('button', { name: 'Create sub-map from group', exact: true })
        .boundingBox())!;
    expect(create.y).toBeGreaterThanOrEqual(members.y + members.height);
    await expect(
        inspector
            .getByRole('region', { name: 'Remove selection', exact: true })
            .getByRole('button', { name: 'Delete multi-check', exact: true }),
    ).toHaveCount(1);
    await expect(
        page.getByRole('heading', { name: 'Faron Province', exact: true }),
    ).toHaveCSS('font-weight', '650');
    await setMapZoom(page, 125);
    const stage = page.getByTestId('map-stage');
    const bounds = (await stage.boundingBox())!;
    const x = bounds.x + bounds.width * 0.8,
        y = bounds.y + bounds.height * 0.8;
    await expect(page.getByTestId('map-viewport')).toHaveCSS(
        'user-select',
        'none',
    );
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 45, y - 35, { steps: 5 });
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
        '',
    );
    await expect(selection.locator('option:checked')).toHaveText('Faron Woods');
    await page
        .getByRole('region', { name: 'Map: Faron Province', exact: true })
        .locator('[class*="viewport"]')
        .click({ position: { x: 5, y: 5 } });
    await expect(selection).toHaveValue('');
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Faron Province',
    );
    await selection.selectOption({ label: 'Faron Woods' });
    await expect(nameToggle).not.toBeChecked();
    await expect(
        page.getByRole('status').filter({ hasText: 'Saved locally' }),
    ).toBeVisible();
    await page.reload();
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    await selection.selectOption({ label: 'Faron Woods' });
    await expect(nameToggle).not.toBeChecked();
    await page.screenshot({
        path: 'test-results/v2-editor-selection.png',
        animations: 'disabled',
    });
});

test('V2 group hover titles are optional and keep the V1 default', async ({
    page,
}) => {
    await connectV2(page);
    await marker(page, 'Skyloft').click();
    await marker(page, 'Central Skyloft').hover();
    const popup = page.getByRole('dialog', {
        name: 'Central Skyloft',
        exact: true,
    });
    await expect(
        popup.getByText('Central Skyloft', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Map Editor', exact: true }).click();
    await page
        .getByRole('button', { name: 'Edit Skyloft', exact: true })
        .click();
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Central Skyloft' });
    await page
        .getByRole('checkbox', { name: 'Show name on hover', exact: true })
        .uncheck();
    await page
        .getByRole('link', { name: 'Preview Tracker', exact: true })
        .click();
    await marker(page, 'Central Skyloft').hover();
    await expect(
        popup.getByText('Central Skyloft', { exact: true }),
    ).toHaveCount(0);
    await expect(
        popup.locator('[data-vegetation-check]').first(),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Map Editor', exact: true }).click();
    await page
        .getByRole('button', { name: 'Edit Skyloft', exact: true })
        .click();
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Central Skyloft' });
    await page
        .getByRole('checkbox', { name: 'Show name on hover', exact: true })
        .check();
    await page
        .getByRole('link', { name: 'Preview Tracker', exact: true })
        .click();
    await marker(page, 'Central Skyloft').hover();
    await expect(
        popup.getByText('Central Skyloft', { exact: true }),
    ).toBeVisible();
});

test('V2 editor check lists stay compact and grow only for wrapped names', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Faron Woods' });
    const left = page.locator('aside').first();
    const right = page.locator('aside').last();
    await left
        .getByRole('checkbox', { name: 'Unplaced', exact: true })
        .uncheck();
    await left.getByLabel('Search catalogue').fill('Faron Woods -');
    const compactGap = async (panel: import('@playwright/test').Locator) => {
        const labels = panel.locator('[data-catalogue-row] > label');
        await expect
            .poll(async () => {
                const first = await labels.nth(0).boundingBox();
                const next = await labels.nth(1).boundingBox();
                return first && next ? next.y - first.y - first.height : 999;
            })
            .toBeLessThanOrEqual(6);
        const first = (await labels.nth(0).boundingBox())!;
        const next = (await labels.nth(1).boundingBox())!;
        expect(next.y).toBeGreaterThanOrEqual(first.y + first.height);
    };
    await compactGap(left);
    await compactGap(right);
    const divider = page.getByRole('separator', {
        name: 'Resize right panel',
        exact: true,
    });
    await divider.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', '240');
    await compactGap(right);
    const labels = right.locator('[data-catalogue-row] > label');
    await expect
        .poll(() =>
            labels.evaluateAll((entries) =>
                entries.some(
                    (entry) => entry.getBoundingClientRect().height > 24,
                ),
            ),
        )
        .toBe(true);
    await page.screenshot({
        path: 'test-results/v2-compact-catalogues.png',
        animations: 'disabled',
    });
});

test('V2 panel splitters persist and placement notices do not move the map', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await expect(
        page.getByRole('checkbox', { name: 'Unplaced', exact: true }),
    ).not.toBeChecked();
    const left = page.getByRole('separator', {
        name: 'Resize left panel',
        exact: true,
    });
    await expect(left).toBeVisible();
    const start = Number(await left.getAttribute('aria-valuenow'));
    const bounds = (await left.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + 100, {
        steps: 5,
    });
    await page.mouse.up();
    await expect(left).toHaveAttribute('aria-valuenow', String(start + 40));
    const right = page.getByRole('separator', {
        name: 'Resize right panel',
        exact: true,
    });
    const rightStart = Number(await right.getAttribute('aria-valuenow'));
    await right.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(right).toHaveAttribute(
        'aria-valuenow',
        String(rightStart + 12),
    );
    const horizontal = page.getByRole('separator', {
        name: 'Resize maps and check catalogue',
    });
    const topStart = Number(await horizontal.getAttribute('aria-valuenow'));
    await horizontal.focus();
    await page.keyboard.press('ArrowUp');
    await expect(horizontal).toHaveAttribute(
        'aria-valuenow',
        String(topStart - 12),
    );
    const stage = page.getByTestId('map-stage');
    const workspace = page.locator('[class*="resizableBody"]');
    const footer = page.locator('footer');
    const workspaceBox = (await workspace.boundingBox())!;
    const footerBox = (await footer.boundingBox())!;
    expect(
        Math.abs(workspaceBox.y + workspaceBox.height - footerBox.y),
    ).toBeLessThanOrEqual(1);
    const before = await stage.boundingBox();
    await page.getByRole('button', { name: 'Place link on map' }).click();
    await expect(
        page
            .getByRole('status')
            .filter({ hasText: 'Map-link placement active' }),
    ).toBeVisible();
    expect(await footer.boundingBox()).toEqual(footerBox);
    expect(await stage.boundingBox()).toEqual(before);
    await page.getByRole('button', { name: 'Cancel placement' }).click();
    await page.reload();
    await expect(left).toHaveAttribute('aria-valuenow', String(start + 40));
    await expect(right).toHaveAttribute(
        'aria-valuenow',
        String(rightStart + 12),
    );
    await expect(horizontal).toHaveAttribute(
        'aria-valuenow',
        String(topStart - 12),
    );
    await marker(page, 'Faron Province').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Go to map' }).click();
    await expect(
        page.getByRole('region', { name: 'Map: Faron Province', exact: true }),
    ).toBeVisible();
    await marker(page, 'Back to Sky').dblclick();
    await expect(
        page.getByRole('region', { name: 'Map: The Sky', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await expect(
        page.getByRole('link', { name: 'Map Editor', exact: true }),
    ).toBeVisible();
    const reader = page.getByRole('separator', {
        name: 'Resize left panel',
        exact: true,
    });
    await reader.focus();
    await page.keyboard.press('ArrowRight');
    await expect(reader).toHaveAttribute('aria-valuenow', '292');
    await page.reload();
    await expect(reader).toHaveAttribute('aria-valuenow', '292');
});

test('V2 repeat placements share check state and link colours match their contents', async ({
    page,
}) => {
    await connectV2(page);
    await page.getByRole('link', { name: 'Map Editor' }).click();
    const dump = load(fs.readFileSync('testData/sshd-dump.yaml', 'utf8')) as {
        checks: Record<string, { short_name: string }>;
    };
    const idFor = (name: string) => {
        const entry = Object.entries(dump.checks).find(
            ([, check]) => check.short_name === name,
        );
        if (!entry) throw new Error(name);
        return entry[0];
    };
    const sign = idFor('Central Skyloft - Sign 1');
    const blocked = idFor('Upper Skyloft - Ring Knight Academy Bell');
    const pack = {
        version: 1,
        id: 'repeated',
        name: 'Repeated placements',
        maps: [
            {
                id: 'root',
                name: 'Root',
                image: 'images/map.png',
                width: 843,
                height: 465,
                entranceIds: [],
                markers: [
                    {
                        id: 'first',
                        kind: 'checks',
                        label: 'First placement',
                        x: 120,
                        y: 120,
                        checkIds: [sign],
                    },
                    {
                        id: 'partial',
                        kind: 'checks',
                        label: 'Partly completed',
                        x: 220,
                        y: 120,
                        checkIds: [sign, blocked],
                    },
                    {
                        id: 'second',
                        kind: 'checks',
                        label: 'Second placement',
                        x: 220,
                        y: 120,
                        checkIds: [sign],
                    },
                    {
                        id: 'link',
                        kind: 'link',
                        label: 'Locked destination',
                        x: 400,
                        y: 200,
                        targetMapId: 'locked',
                    },
                    {
                        id: 'finished-link',
                        kind: 'link',
                        label: 'Completed destination',
                        x: 500,
                        y: 200,
                        targetMapId: 'finished',
                    },
                ],
            },
            {
                id: 'locked',
                name: 'Destination map name',
                image: 'images/map.png',
                width: 843,
                height: 465,
                entranceIds: [],
                markers: [
                    {
                        id: 'locked-check',
                        kind: 'checks',
                        label: 'Locked check',
                        x: 200,
                        y: 200,
                        checkIds: [blocked],
                    },
                ],
            },
            {
                id: 'finished',
                name: 'Completed map',
                image: 'images/map.png',
                width: 843,
                height: 465,
                entranceIds: [],
                markers: [
                    {
                        id: 'finished-check',
                        kind: 'checks',
                        label: 'Completed check',
                        x: 120,
                        y: 120,
                        checkIds: [sign],
                    },
                ],
            },
        ],
    };
    await page.getByLabel('Import pack', { exact: true }).setInputFiles({
        name: 'repeat.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from(
            zipSync({
                'pack.json': strToU8(JSON.stringify(pack)),
                'images/map.png': fs.readFileSync('src/assets/maps/Faron.png'),
            }),
        ),
    });
    await expect(page.getByLabel('Pack name', { exact: true })).toHaveValue(
        'Repeated placements',
    );
    await expect(
        page.getByText('2/15016 checks placed', { exact: true }),
    ).toHaveCSS('color', 'rgb(212, 71, 71)');
    // Repeating a placement through the catalogue is allowed too, not only on import.
    await page
        .getByRole('checkbox', { name: 'Unplaced', exact: true })
        .uncheck();
    await page.getByLabel('Search catalogue').fill('Central Skyloft - Sign 1');
    await page
        .getByRole('checkbox', {
            name: 'Central Skyloft - Sign 1',
            exact: true,
        })
        .check();
    await page
        .getByRole('button', { name: 'Place selected checks', exact: true })
        .click();
    const map = page.getByTestId('map-stage');
    const rect = (await map.boundingBox())!;
    await map.click({
        position: { x: rect.width * 0.3, y: rect.height * 0.8 },
    });
    await expect(marker(page, 'Central Skyloft - Sign 1')).toBeVisible();
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    const unplacedButton = page.getByRole('button', {
        name: /^Unplaced checks \([1-9]\d*\)$/,
    });
    await expect(unplacedButton).toBeVisible();
    await unplacedButton.click();
    await expect(
        page
            .getByRole('dialog', { name: 'Unplaced checks', exact: true })
            .locator('[data-vegetation-check]')
            .first(),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(marker(page, 'First placement')).toHaveAttribute(
        'data-status',
        'available',
    );
    await marker(page, 'First placement').hover();
    const singlePopup = page.getByRole('dialog', {
        name: 'First placement',
        exact: true,
    });
    await expect(
        singlePopup.getByText('First placement', { exact: true }),
    ).toHaveCount(0);
    await expect(
        singlePopup.getByRole('button', {
            name: 'Central Skyloft - Sign 1',
            exact: true,
        }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await marker(page, 'First placement').click();
    await page.keyboard.press('Escape');
    await expect(marker(page, 'First placement')).toHaveAttribute(
        'data-status',
        'done',
    );
    await expect(marker(page, 'Second placement')).toHaveAttribute(
        'data-status',
        'done',
    );
    await expect(marker(page, 'Central Skyloft - Sign 1')).toHaveAttribute(
        'data-status',
        'done',
    );
    const link = marker(page, 'Locked destination');
    await expect(link).toHaveAttribute('data-status', 'unavailable');
    await expect(link).toHaveCSS('background-color', 'rgb(213, 75, 70)');
    const partial = marker(page, 'Partly completed');
    await expect(partial).toHaveAttribute('data-status', 'unavailable');
    await expect(partial).toHaveCSS('z-index', '1');
    const completed = marker(page, 'Second placement');
    await expect(completed).toHaveCSS('z-index', '0');
    await expect(completed).toHaveAttribute('data-count-visible', 'false');
    await expect(completed).toHaveText('');
    expect((await completed.boundingBox())!.width).toBeCloseTo(
        ((await partial.boundingBox())!.width * 2) / 3,
        1,
    );
    const completedLink = marker(page, 'Completed destination');
    await expect(completedLink).toHaveAttribute('data-status', 'done');
    expect((await completedLink.boundingBox())!.width).toBe(
        (await link.boundingBox())!.width,
    );
    const controls = page.getByRole('region', {
        name: 'Map: Root',
        exact: true,
    });
    await expect(
        controls.getByRole('button', {
            name: /^(World map|Previous map|Follow player|Hide completed checks|Marker size|Map zoom)$/,
        }),
    ).toHaveCount(6);
    expect(
        await controls
            .getByRole('button', {
                name: /^(World map|Previous map|Follow player|Hide completed checks|Marker size|Map zoom)$/,
            })
            .evaluateAll((buttons) =>
                buttons.map((button) => button.getAttribute('aria-label')),
            ),
    ).toEqual([
        'World map',
        'Previous map',
        'Follow player',
        'Hide completed checks',
        'Marker size',
        'Map zoom',
    ]);
    const hide = page.getByRole('button', {
        name: 'Hide completed checks',
        exact: true,
    });
    await expect(hide).toHaveAttribute('aria-pressed', 'false');
    await hide.click();
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await expect(marker(page, 'First placement')).toHaveCount(0);
    await expect(marker(page, 'Second placement')).toHaveCount(0);
    await expect(partial).toBeVisible();
    await expect(completedLink).toBeVisible();
    await hide.click();
    await expect(marker(page, 'First placement')).toBeVisible();
    await link.hover();
    const popup = page.getByRole('dialog', {
        name: 'Locked destination',
        exact: true,
    });
    await expect(
        popup.getByRole('button', {
            name: 'Upper Skyloft - Ring Knight Academy Bell',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        popup.getByText('Destination map name', { exact: true }),
    ).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Open map' })).toHaveCount(
        0,
    );
    await popup
        .getByRole('button', { name: 'Locked destination', exact: true })
        .click();
    await expect(
        page.getByRole('region', {
            name: 'Map: Destination map name',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('link', { name: 'Classic Tracker' }),
    ).toHaveCount(0);
    await page.goto('/tracker');
    await expect(page.getByRole('link', { name: 'V2 Preview' })).toHaveCount(0);
    await expect(page.getByRole('link').filter({ hasText: 'V2' })).toHaveCount(
        0,
    );
});

test('V2 starts with V1 maps, uses nested hover requirements, wheel zoom and live AP updates', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await connectV2(page);
    await expect(
        page.getByRole('region', { name: 'Map: The Sky', exact: true }),
    ).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(1);
    await expect(
        page.getByRole('button', { name: /^Unplaced checks/ }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Entrances', exact: true }),
    ).toHaveCount(0);
    await marker(page, 'Skyloft').click();
    await marker(page, 'Central Skyloft').hover();
    const popup = page.getByRole('dialog', {
        name: 'Central Skyloft',
        exact: true,
    });
    await expect(popup).toBeVisible();
    await expect(
        popup.getByText('Central Skyloft', { exact: true }),
    ).toBeVisible();
    const sign = await findHoverCheck(popup, 'Central Skyloft - Sign 1');
    await expect(popup.getByRole('textbox')).toHaveCount(0);
    await sign.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    const requirementPopup = page
        .locator('[data-radix-popper-content-wrapper]')
        .filter({ has: page.getByRole('tooltip') });
    await expect
        .poll(() =>
            requirementPopup.evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                const top = window.document.elementFromPoint(
                    bounds.x + bounds.width / 2,
                    bounds.y + bounds.height / 2,
                );
                return top !== null && element.contains(top);
            }),
        )
        .toBe(true);
    await page.screenshot({
        path: 'test-results/v2-hover.png',
        animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    const stage = page.getByTestId('map-stage');
    const bounds = (await stage.boundingBox())!;
    await page.mouse.move(
        bounds.x + bounds.width * 0.75,
        bounds.y + bounds.height * 0.8,
    );
    await page.mouse.wheel(0, -400);
    await expect
        .poll(() => page.getByLabel('Map zoom').textContent())
        .not.toBe('100%');
    await expect
        .poll(async () => (await stage.boundingBox())!.width)
        .toBeGreaterThan(bounds.width);
    await page.getByRole('button', { name: 'Fit map' }).click();
    await marker(page, 'Back to Sky').click();
    await marker(page, 'Faron Province').click();
    await marker(page, 'Faron Woods').hover();
    await expect(
        page.getByRole('dialog', { name: 'Faron Woods', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await page
        .getByRole('button', { name: 'Server & Tools', exact: true })
        .click();
    await page.getByPlaceholder('Enter a command here').fill('!demo-sign');
    await page.getByPlaceholder('Enter a command here').press('Enter');
    await page.getByRole('button', { name: 'Tracker', exact: true }).click();
    await page.getByRole('button', { name: 'World map' }).click();
    await marker(page, 'Skyloft').hover();
    const linkPopup = page.getByRole('dialog', {
        name: 'Skyloft',
        exact: true,
    });
    await expect(
        linkPopup.locator('[data-vegetation-check]').first(),
    ).toBeVisible();
    await expect(
        linkPopup.getByRole('button', { name: 'Open map' }),
    ).toHaveCount(0);
    await linkPopup
        .getByRole('button', { name: 'Skyloft', exact: true })
        .click();
    await marker(page, 'Central Skyloft').hover();
    const checkedSign = await findHoverCheck(popup, 'Central Skyloft - Sign 1');
    await expect(checkedSign).toHaveCSS('text-decoration-line', 'line-through');
    await page.keyboard.press('Escape');
    const image = page.getByRole('img', { name: 'Skyloft', exact: true });
    await expect
        .poll(() =>
            image.evaluate(
                (element: HTMLImageElement) =>
                    element.complete && element.naturalWidth > 0,
            ),
        )
        .toBe(true);
    await image.evaluate((element: HTMLImageElement) => element.decode());
    await page.screenshot({
        path: 'test-results/v2-reader.png',
        animations: 'disabled',
    });
    await page.setViewportSize({ width: 600, height: 820 });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: 'test-results/v2-reader-mobile.png',
        animations: 'disabled',
        fullPage: true,
    });
    expect(errors).toEqual([]);
});

test('V2 hovers virtualize grass blades, retain nested requirements and keep checked members visible', async ({
    page,
}) => {
    await connectV2(page, 'Blade Player');
    await marker(page, 'Skyloft').click();
    await marker(page, 'Central Skyloft').hover();
    const popup = page.getByRole('dialog', {
        name: 'Central Skyloft',
        exact: true,
    });
    const blade = await findHoverCheck(
        popup,
        'Central Skyloft - Grass Patch 1 - Blade 1',
    );
    await expect(blade).toHaveCSS('text-decoration-line', 'line-through');
    const next = await findHoverCheck(
        popup,
        'Central Skyloft - Grass Patch 1 - Blade 8',
    );
    await next.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    expect(await popup.locator('[data-vegetation-check]').count()).toBeLessThan(
        25,
    );
    await expect(popup.getByRole('textbox')).toHaveCount(0);
    await expect(
        popup.getByRole('button', { name: 'Accessible', exact: true }),
    ).toHaveCount(0);
});

test('V2 editor extracts members, merges by drag with undo and redo, expands regions and round trips packs', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/v2/editor');
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    await page
        .getByLabel('Select check or link', { exact: true })
        .selectOption({ label: 'Faron Woods' });
    await page
        .getByLabel('Search group members')
        .fill('Faron Woods - Chest behind Upper Bombable Rock');
    const member = page.getByRole('checkbox', {
        name: 'Faron Woods - Chest behind Upper Bombable Rock',
        exact: true,
    });
    await member.check();
    await page
        .getByRole('button', { name: 'Extract selected (1)', exact: true })
        .click();
    await page
        .getByLabel('Select check or link', { exact: true })
        .selectOption({
            label: 'Faron Woods - Chest behind Upper Bombable Rock',
        });
    const source = marker(
        page,
        'Faron Woods - Chest behind Upper Bombable Rock',
    );
    const destination = marker(page, 'Faron Woods');
    const from = (await source.boundingBox())!;
    const to = (await destination.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
        steps: 8,
    });
    await page.mouse.up();
    await expect(source).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(source).toBeVisible();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(source).toHaveCount(0);

    await page
        .getByRole('button', { name: 'Create sub-map from group', exact: true })
        .click();

    const create = page.getByRole('dialog', { name: 'Create sub-map' });
    await expect(page.locator('[aria-label="Maps"] > button')).toHaveCount(5);
    await create.getByLabel('New map name').fill('Faron Woods');
    await create
        .getByLabel('New map image')
        .setInputFiles(path.resolve('src/assets/maps/Faron.png'));
    await create
        .getByRole('button', { name: 'Create map', exact: true })
        .click();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Faron Woods',
    );
    await expect(page.getByTestId('map-stage').getByRole('button')).toHaveCount(
        2,
    );
    const groupBox = (await marker(page, 'Faron Woods').boundingBox())!;
    const stageBox = (await page.getByTestId('map-stage').boundingBox())!;
    expect(
        Math.abs(
            groupBox.x + groupBox.width / 2 - stageBox.x - stageBox.width / 2,
        ),
    ).toBeLessThanOrEqual(1);
    expect(
        Math.abs(
            groupBox.y + groupBox.height / 2 - stageBox.y - stageBox.height / 2,
        ),
    ).toBeLessThanOrEqual(1);

    await expect(page.locator('[aria-label="Maps"] > button')).toHaveCount(6);
    await page
        .getByLabel('Map name', { exact: true })
        .fill('Faron Woods Detail');
    await expect(
        page.getByRole('status').filter({ hasText: 'Saved locally' }),
    ).toBeVisible();
    await page.screenshot({
        path: 'test-results/v2-editor.png',
        animations: 'disabled',
    });
    const event = page.waitForEvent('download');
    await page
        .getByRole('button', { name: 'Export pack', exact: true })
        .click();

    const exportDialog = page.getByRole('dialog', { name: 'Export map pack' });
    await exportDialog.getByLabel('Export pack name').fill('My test pack');
    await exportDialog.getByRole('button', { name: 'Download ZIP' }).click();
    const filename = (await (await event).path())!;
    await expect(
        page
            .getByRole('status')
            .filter({ hasText: 'Saved locally · Exported' }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('status')
            .filter({ hasText: 'Saved locally · Exported' }),
    ).toHaveAttribute('data-state', 'complete');
    await expect(
        page
            .getByRole('status')
            .filter({ hasText: 'Saved locally · Exported' }),
    ).toHaveCSS('color', 'rgb(35, 131, 70)');

    const archive = unzipSync(fs.readFileSync(filename));
    const manifest = JSON.parse(strFromU8(archive['pack.json'])) as {
        maps: {
            name: string;
            markers: { kind: string; label: string; checkIds?: string[] }[];
        }[];
    };
    expect(manifest.maps).toHaveLength(6);
    const refs = manifest.maps.flatMap((map) =>
        map.markers.flatMap((entry) => entry.checkIds ?? []),
    );
    expect(refs.length).toBe(new Set(refs).size);
    expect(refs.length).toBeGreaterThan(14900);
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await marker(page, 'Faron Province').click();
    await marker(page, 'Faron Woods').click();
    await expect(
        page.getByRole('region', {
            name: 'Map: Faron Woods Detail',
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Map Editor' }).click();
    await page.getByLabel('Map name', { exact: true }).fill('Temporary');
    await expect(
        page.getByRole('status').filter({ hasText: 'Unexported changes' }),
    ).toBeVisible();
    await page
        .getByLabel('Import pack', { exact: true })
        .setInputFiles(filename);
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'The Sky',
    );
    await expect(
        page.getByRole('status').filter({ hasText: 'Map pack imported.' }),
    ).toBeVisible();
    await expect(
        page.getByRole('status').filter({ hasText: 'Saved locally' }),
    ).toBeVisible();
    await page.reload();
    await page
        .getByRole('button', { name: 'Edit Faron Woods Detail', exact: true })
        .click();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Faron Woods Detail',
    );
    await page.screenshot({
        path: 'test-results/v2-editor-detail.png',
        animations: 'disabled',
    });
    expect(errors).toEqual([]);
});

test('V2 editor extracts one selected group and creates a sub-map from only selected members', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    const selection = page.getByLabel('Select check or link', { exact: true });
    await selection.selectOption({ label: 'Faron Woods' });
    const members = page.getByLabel('Search group members');
    await members.fill('Chest');
    // Only the two member checkboxes, not the catalogue's separate selection.
    const list = page.locator('aside').last().locator('[class*="memberList"]');
    const memberBoxes = list.getByRole('checkbox');
    await expect(memberBoxes.first()).toBeVisible();
    const ids = await memberBoxes.evaluateAll((inputs) =>
        inputs
            .slice(0, 2)
            .map((input) => input.closest('label')!.textContent!.trim()),
    );
    expect(ids.every(Boolean)).toBe(true);
    for (const name of ids)
        await list.getByRole('checkbox', { name: name!, exact: true }).check();
    await page
        .getByRole('button', { name: 'Extract selected (2)', exact: true })
        .click();
    await expect(
        page.getByLabel('Selection name', { exact: true }),
    ).toHaveValue('Faron Woods (selection)');
    await expect(page.getByText('2 checks', { exact: true })).toBeVisible();
    await expect(marker(page, 'Faron Woods (selection)')).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await selection.selectOption({ label: 'Faron Woods' });
    await members.fill('Chest');
    for (const name of ids)
        await list.getByRole('checkbox', { name: name!, exact: true }).check();
    await page
        .getByRole('button', {
            name: 'Create sub-map from selected',
            exact: true,
        })
        .click();
    const create = page.getByRole('dialog', {
        name: 'Create sub-map',
        exact: true,
    });
    await create.getByLabel('New map name').fill('Selected chests');
    await expect(
        create.getByRole('button', { name: 'Create map', exact: true }),
    ).toBeDisabled();
    await create
        .getByLabel('New map image')
        .setInputFiles(path.resolve('src/assets/maps/Faron.png'));
    await create
        .getByRole('button', { name: 'Create map', exact: true })
        .click();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Selected chests',
    );
    await expect(page.locator('[aria-label="Maps"] > button')).toHaveCount(6);
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    await expect(marker(page, 'Faron Woods')).toBeVisible();
    await expect(marker(page, 'Selected chests')).toBeVisible();
    const downloadEvent = page.waitForEvent('download');
    await page
        .getByRole('button', { name: 'Export pack', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Download ZIP', exact: true })
        .click();
    const zip = unzipSync(
        fs.readFileSync((await (await downloadEvent).path())!),
    );
    const pack = JSON.parse(strFromU8(zip['pack.json'])) as {
        maps: {
            name: string;
            width: number;
            height: number;
            markers: { checkIds?: string[]; x: number; y: number }[];
        }[];
    };
    const child = pack.maps.find((map) => map.name === 'Selected chests')!;
    expect(child.markers).toHaveLength(2);
    expect(child.markers.find((entry) => entry.checkIds)).toMatchObject({
        x: child.width / 2,
        y: child.height / 2,
    });
    expect(child.markers.flatMap((entry) => entry.checkIds ?? [])).toHaveLength(
        2,
    );
    const refs = pack.maps.flatMap((map) =>
        map.markers.flatMap((entry) => entry.checkIds ?? []),
    );
    expect(refs).toHaveLength(15016);
    expect(new Set(refs).size).toBe(refs.length);
});

test('V2 editor associates searchable game exits and map arrivals, and manual entrance changes update navigation and hover checks', async ({
    page,
}) => {
    test.setTimeout(60_000);
    await connectV2(page, 'Entrance Player');
    await page.getByRole('link', { name: 'Map Editor' }).click();
    const { pack, exit, arrivalA, arrivalB } = manualEntranceFixture();
    await importManualEntranceFixture(page, pack);
    const selection = page.getByLabel('Select check or link', { exact: true });
    await selection.selectOption({ label: 'Dungeon Door' });
    await page
        .getByRole('button', { name: 'Game entrance', exact: true })
        .click();
    const exitPicker = page.getByRole('combobox', {
        name: 'Game exit',
        exact: true,
    });
    await exitPicker.fill('skyview deep woods');
    await page.screenshot({
        path: 'test-results/v2-exit-search.png',
        animations: 'disabled',
    });
    await page
        .getByRole('option', {
            name: 'Skyview Temple (via Deep Woods)',
            exact: true,
        })
        .click();
    await expect(
        page
            .getByRole('status')
            .filter({ hasText: 'Destination not mapped in Entrances' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Go to destination', exact: true }),
    ).toBeDisabled();
    await page.screenshot({
        path: 'test-results/v2-link-binding.png',
        animations: 'disabled',
    });
    for (const [mapName, query, option] of [
        [
            'Skyview Map',
            'skyview deep woods',
            'Skyview Temple (via Deep Woods)',
        ],
        [
            'Earth Temple Map',
            'earth temple eldin',
            'Earth Temple (via Eldin Volcano)',
        ],
    ]) {
        await page
            .getByRole('button', { name: `Edit ${mapName}`, exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Configure associations' })
            .click();
        await page.getByRole('tab', { name: 'Entrance destinations' }).click();
        await page.getByLabel('Search associations').fill(query);
        await page.getByRole('checkbox', { name: option, exact: true }).check();
        await page
            .getByRole('button', { name: 'Apply Changes', exact: true })
            .click();
        await page
            .getByRole('button', {
                name: 'Close map associations',
                exact: true,
            })
            .click();
        await expect(
            page.getByText('Entrance destinations: 1 entrances', {
                exact: true,
            }),
        ).toBeVisible();
    }
    await page
        .getByRole('button', { name: 'Edit Door Map', exact: true })
        .click();
    await page.getByRole('button', { name: 'Configure associations' }).click();
    await page.getByRole('tab', { name: 'Entrance destinations' }).click();
    await page.getByLabel('Search associations').fill('earth temple eldin');
    await page
        .getByRole('checkbox', {
            name: 'Earth Temple (via Eldin Volcano)',
            exact: true,
        })
        .check();
    await expect(
        page.getByText('Assigned to Earth Temple Map', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Apply Changes', exact: true }),
    ).toBeEnabled();
    await page
        .getByRole('button', { name: 'Discard Changes', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Close map associations', exact: true })
        .click();
    await selection.selectOption({ label: 'Dungeon Door' });
    await expect(
        page.getByRole('button', { name: 'Game entrance', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    const downloadEvent = page.waitForEvent('download');
    await page
        .getByRole('button', { name: 'Export pack', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Download ZIP', exact: true })
        .click();
    const filename = (await (await downloadEvent).path())!;
    const archive = unzipSync(fs.readFileSync(filename));
    const saved = JSON.parse(strFromU8(archive['pack.json']));
    expect(saved.maps[0].markers[0].exitId).toBe(exit);
    expect(saved.maps[0].markers[0]).not.toHaveProperty('navigation');
    expect(saved.maps[1].entranceIds).toEqual([arrivalA]);
    expect(saved.maps[2].entranceIds).toEqual([arrivalB]);
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await marker(page, 'Dungeon Door').click();
    const dialog = page.getByRole('dialog', { name: 'Entrances', exact: true });
    await expect(dialog.getByPlaceholder('Search exits')).toHaveValue(
        'Skyview Temple (via Deep Woods)',
    );
    const destination = dialog.getByRole('combobox', {
        name: 'Deep Woods -> Skyview Temple',
        exact: true,
    });
    await destination.fill('Earth Temple');
    await page
        .getByRole('option', {
            name: 'Eldin Volcano -> Earth Temple',
            exact: true,
        })
        .click();
    await page.keyboard.press('Escape');
    await marker(page, 'Dungeon Door').hover();
    const popup = page.getByRole('dialog', {
        name: 'Dungeon Door',
        exact: true,
    });
    await expect(
        popup.getByLabel('Entrance connection', { exact: true }),
    ).toContainText('Earth Temple Map');
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Map Editor' }).click();
    await page
        .getByRole('button', { name: 'Edit Door Map', exact: true })
        .click();
    await marker(page, 'Dungeon Door').dblclick();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Earth Temple Map',
    );
    await page
        .getByRole('button', { name: 'Edit Door Map', exact: true })
        .click();
    await marker(page, 'Dungeon Door').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Go to map' }).click();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Earth Temple Map',
    );
    await page
        .getByRole('button', { name: 'Edit Door Map', exact: true })
        .click();
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await marker(page, 'Dungeon Door').hover();
    await expect(
        popup.getByRole('button', {
            name: 'Upper Skyloft - Ring Knight Academy Bell',
            exact: true,
        }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await marker(page, 'Dungeon Door').click();
    await expect(
        page.getByRole('region', {
            name: 'Map: Earth Temple Map',
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'World map', exact: true }).click();
    await marker(page, 'Dungeon Door').hover();
    await popup
        .getByRole('button', { name: 'Edit entrance connection', exact: true })
        .click();
    await destination.fill('Skyview Temple');
    await page
        .getByRole('option', {
            name: 'Deep Woods -> Skyview Temple',
            exact: true,
        })
        .click();
    await page.keyboard.press('Escape');
    await expect(marker(page, 'Dungeon Door')).toHaveAttribute(
        'data-status',
        'available',
    );
    await marker(page, 'Dungeon Door').hover();
    await expect(
        popup.getByLabel('Entrance connection', { exact: true }),
    ).toContainText('Skyview Map');
    await expect(
        popup.getByRole('button', {
            name: 'Central Skyloft - Sign 1',
            exact: true,
        }),
    ).toBeVisible();
    await page.screenshot({
        path: 'test-results/v2-manual-entrances.png',
        animations: 'disabled',
    });
    await popup
        .getByRole('button', { name: 'Edit entrance connection', exact: true })
        .click();
    await destination.click();
    await page.getByRole('option', { name: 'Reset', exact: true }).click();
    await page.keyboard.press('Escape');
    await marker(page, 'Dungeon Door').click();
    await expect(dialog).toBeVisible();
    await expect(
        page.locator('section[aria-label="Map: Door Map"]'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Map Editor' }).click();
    await page
        .getByLabel('Import pack', { exact: true })
        .setInputFiles(filename);
    await expect(
        page.getByRole('status').filter({ hasText: 'Map pack imported.' }),
    ).toBeVisible();
    await selection.selectOption({ label: 'Dungeon Door' });
    await page.getByRole('button', { name: 'Fixed map', exact: true }).click();
    await expect(
        page.getByLabel('Link destination map', { exact: true }),
    ).toHaveValue('skyview');
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await marker(page, 'Dungeon Door').click();
    await expect(
        page.getByRole('region', { name: 'Map: Skyview Map', exact: true }),
    ).toBeVisible();
});

test('V2 game links keep vanilla routing without ER and require an assigned arrival map', async ({
    page,
}) => {
    await connectV2(page);
    await page.getByRole('link', { name: 'Map Editor' }).click();
    const { pack, exit, arrivalA } = manualEntranceFixture();
    Object.assign(pack.maps[0].markers[0], {
        exitId: exit,
        targetMapId: 'earth',
        navigation: undefined,
    });
    await importManualEntranceFixture(page, pack);
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await expect(
        page.getByRole('button', { name: 'Entrances', exact: true }),
    ).toHaveCount(0);
    await marker(page, 'Dungeon Door').hover();
    const popup = page.getByRole('dialog', {
        name: 'Dungeon Door',
        exact: true,
    });
    await expect(
        popup.getByLabel('Entrance connection', { exact: true }),
    ).toContainText('No map assigned');
    await expect(
        popup.getByLabel('Entrance connection', { exact: true }),
    ).toContainText('Skyview Temple');
    await page.keyboard.press('Escape');
    await marker(page, 'Dungeon Door').click();
    await expect(
        page.getByRole('dialog', { name: 'Entrances', exact: true }),
    ).toBeVisible();
    await expect(
        page.locator('section[aria-label="Map: Door Map"]'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Map Editor' }).click();
    await page
        .getByRole('button', { name: 'Edit Skyview Map', exact: true })
        .click();
    await page.getByRole('button', { name: 'Configure associations' }).click();
    await page.getByRole('tab', { name: 'Entrance destinations' }).click();
    await page
        .getByRole('checkbox', {
            name: 'Skyview Temple (via Deep Woods)',
            exact: true,
        })
        .check();
    await page
        .getByRole('button', { name: 'Apply Changes', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Close map associations', exact: true })
        .click();
    await page.getByRole('button', { name: 'Configure associations' }).click();
    await page.getByRole('tab', { name: 'Entrance destinations' }).click();
    await page
        .getByRole('button', {
            name: `Remove arrival ${arrivalA}`,
            exact: true,
        })
        .click();
    await page
        .getByRole('button', { name: 'Apply Changes', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Close map associations', exact: true })
        .click();
    await expect(
        page.getByText('Entrance destinations: 0 entrances', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
        page.getByText('Entrance destinations: 1 entrances', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Edit Door Map', exact: true })
        .click();
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Dungeon Door' });
    await expect(
        page.getByRole('status').filter({ hasText: 'Map: Skyview Map' }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Go to destination', exact: true })
        .click();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Skyview Map',
    );
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await marker(page, 'Dungeon Door').click();
    await expect(
        page.getByRole('region', { name: 'Map: Skyview Map', exact: true }),
    ).toBeVisible();
});

test('V2 optional player following handles absent telemetry, real movement, manual browsing, loading and other players safely', async ({
    page,
}) => {
    await connectV2(page);
    const follow = page.getByRole('button', {
        name: 'Follow player',
        exact: true,
    });
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page.getByRole('region', { name: 'Map: The Sky', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-stage F100');
    await expect(
        page.getByRole('region', { name: 'Map: Faron Province', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'World map', exact: true }).click();
    await sendTelemetryCommand(page, '!demo-stage F100');
    await expect(
        page.getByRole('region', { name: 'Map: The Sky', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-loading F200');
    await expect(
        page.getByRole('region', { name: 'Map: The Sky', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-stage F200');
    await expect(
        page.getByRole('region', { name: 'Map: Eldin Province', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-other-stage F100', true);
    await expect(
        page.getByRole('region', { name: 'Map: Eldin Province', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-stage UNKNOWN');
    await expect(
        page.getByRole('region', { name: 'Map: Eldin Province', exact: true }),
    ).toBeVisible();
    await follow.click();
    await sendTelemetryCommand(page, '!demo-stage F100');
    await expect(
        page.getByRole('region', { name: 'Map: Eldin Province', exact: true }),
    ).toBeVisible();
    await follow.click();
    await expect(
        page.getByRole('region', { name: 'Map: Faron Province', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    await expect(follow).toHaveAttribute(
        'title',
        /waiting for client telemetry/,
    );
});

test('V2 editor exports stage rules and player following prefers specific rules without guessing ambiguous maps', async ({
    page,
}) => {
    await connectV2(page);
    await page.getByRole('link', { name: 'Map Editor' }).click();
    const { pack } = manualEntranceFixture();
    await importManualEntranceFixture(page, pack);
    for (const [name, room, layer] of [
        ['Door Map', '', ''],
        ['Skyview Map', '1', ''],
        ['Earth Temple Map', '', '0'],
    ]) {
        await page
            .getByRole('button', { name: `Edit ${name}`, exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Configure associations' })
            .click();
        await page
            .getByText('Advanced conditions (optional)', { exact: true })
            .click();
        await page.getByLabel('Tracking Room', { exact: true }).fill(room);
        await page.getByLabel('Tracking Layer', { exact: true }).fill(layer);
        await page.getByLabel('Search associations').fill('F000');
        await page
            .getByRole('checkbox', { name: 'Skyloft (F000)', exact: true })
            .check();
        await page
            .getByRole('button', { name: 'Apply Changes', exact: true })
            .click();
        await page
            .getByRole('button', {
                name: 'Close map associations',
                exact: true,
            })
            .click();
    }
    await page.screenshot({
        path: 'test-results/v2-tracking-rules.png',
        animations: 'disabled',
    });
    const download = page.waitForEvent('download');
    await page
        .getByRole('button', { name: 'Export pack', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Download ZIP', exact: true })
        .click();
    const filename = (await (await download).path())!;
    const zip = unzipSync(fs.readFileSync(filename));
    const saved = JSON.parse(strFromU8(zip['pack.json']));
    expect(saved.maps[0].trackingRules).toEqual([{ stage: 'F000' }]);
    expect(saved.maps[1].trackingRules).toEqual([{ stage: 'F000', room: 1 }]);
    await page
        .getByLabel('Import pack', { exact: true })
        .setInputFiles(filename);
    await expect(
        page.getByRole('status').filter({ hasText: 'Map pack imported.' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await expect(
        page.getByRole('button', { name: 'Follow player', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await sendTelemetryCommand(page, '!demo-stage F000 1 1');
    await expect(
        page.getByRole('region', { name: 'Map: Skyview Map', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-stage F000 2 1');
    await expect(
        page.getByRole('region', { name: 'Map: Door Map', exact: true }),
    ).toBeVisible();
    await sendTelemetryCommand(page, '!demo-stage F000 1 0');
    await expect(
        page.getByRole('region', { name: 'Map: Door Map', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Server & Tools', exact: true })
        .click();
    await expect(
        page.getByRole('region', {
            name: 'Player tracking diagnostics',
            exact: true,
        }),
    ).toContainText('Map: ambiguous');
});

test('V2 entrance discoveries are reviewed before application and never overwrite a manual mapping', async ({
    page,
}) => {
    await connectV2(page, 'Entrance Player');
    await page.getByRole('link', { name: 'Map Editor' }).click();
    const { pack, exit, arrivalA, arrivalB } = manualEntranceFixture();
    Object.assign(pack.maps[0].markers[0], {
        exitId: exit,
        navigation: undefined,
    });
    pack.maps[1].entranceIds.push(arrivalA);
    pack.maps[2].entranceIds.push(arrivalB);
    await importManualEntranceFixture(page, pack);
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await sendTelemetryCommand(page, '!demo-discover');
    await marker(page, 'Dungeon Door').hover();
    const popup = page.getByRole('dialog', {
        name: 'Dungeon Door',
        exact: true,
    });
    await expect(popup).toContainText('Destination not mapped in Entrances');
    await page.keyboard.press('Escape');
    await page
        .getByRole('button', { name: 'Server & Tools', exact: true })
        .click();
    await page
        .getByRole('button', {
            name: 'Apply compatible discoveries (1)',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('status').filter({ hasText: 'Applied 1 discoveries' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tracker', exact: true }).click();
    await marker(page, 'Dungeon Door').hover();
    await expect(
        popup.getByLabel('Entrance connection', { exact: true }),
    ).toContainText('Earth Temple Map');
    await popup
        .getByRole('button', { name: 'Edit entrance connection', exact: true })
        .click();
    const dialog = page.getByRole('dialog', { name: 'Entrances', exact: true });
    await dialog
        .getByRole('combobox', {
            name: 'Deep Woods -> Skyview Temple',
            exact: true,
        })
        .fill('Skyview Temple');
    await page
        .getByRole('option', {
            name: 'Deep Woods -> Skyview Temple',
            exact: true,
        })
        .click();
    await page.keyboard.press('Escape');
    await sendTelemetryCommand(page, '!demo-discover');
    await page
        .getByRole('button', { name: 'Server & Tools', exact: true })
        .click();
    await expect(
        page.getByRole('region', {
            name: 'Player tracking diagnostics',
            exact: true,
        }),
    ).toContainText('Conflict with current mapping');
    await expect(
        page.getByRole('button', {
            name: 'Apply compatible discoveries (0)',
            exact: true,
        }),
    ).toBeDisabled();
    await page.screenshot({
        path: 'test-results/v2-telemetry-diagnostics.png',
        animations: 'disabled',
    });
    await expect(
        page.getByRole('button', { name: 'Tracker', exact: true }),
    ).toBeInViewport({ ratio: 1 });
});

test('V2 editor selects and clears filtered group members with compact aligned controls', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Faron Woods' });
    const right = page.locator('aside').last();
    const search = right.getByLabel('Search group members');
    const selectAll = right.getByRole('button', {
        name: 'Select all group checks',
        exact: true,
    });
    const clear = right.getByRole('button', {
        name: 'Clear group selection',
        exact: true,
    });
    await search.fill('Faron Woods - Chest behind Upper Bombable Rock');
    await selectAll.click();
    await expect(
        right.getByRole('checkbox', {
            name: 'Faron Woods - Chest behind Upper Bombable Rock',
            exact: true,
        }),
    ).toBeChecked();
    await expect(
        right.getByRole('button', {
            name: 'Extract selected (1)',
            exact: true,
        }),
    ).toBeEnabled();
    await clear.click();
    await expect(
        right.getByRole('button', {
            name: 'Extract selected (0)',
            exact: true,
        }),
    ).toBeDisabled();
    await search.fill('no such check');
    await expect(selectAll).toBeDisabled();
    await search.fill('');
    const total = Number(
        (await right.locator('[class*="memberCount"]').textContent())!.split(
            ' ',
        )[0],
    );
    await selectAll.click();
    await expect(
        right.getByRole('button', {
            name: `Extract selected (${total})`,
            exact: true,
        }),
    ).toBeEnabled();
    await clear.click();
    const boxes = await Promise.all(
        [search, selectAll, clear].map((control) => control.boundingBox()),
    );
    const centers = boxes.map((box) => box!.y + box!.height / 2);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
    await page.screenshot({
        path: 'test-results/v2-group-controls.png',
        animations: 'disabled',
    });
});

test('V2 reuses V1 dungeon controls and right-click navigation follows authored dungeon placements', async ({
    page,
}) => {
    await connectV2(page);
    const dungeons = page.getByRole('region', {
        name: 'Dungeons',
        exact: true,
    });
    await expect(
        dungeons.getByRole('button', { name: 'SV', exact: true }),
    ).toBeVisible();
    const swordless = dungeons.getByRole('button', { name: 'SV', exact: true });
    const color = await swordless
        .locator('span')
        .evaluate((element) => getComputedStyle(element).color);
    await swordless.click();
    await expect(swordless.locator('span')).not.toHaveCSS('color', color);
    await swordless.click();
    for (const [abbr, name] of [
        ['SV', 'Faron Province'],
        ['ET', 'Eldin Province'],
        ['LMF', 'Lanayru Province'],
        ['AC', 'Faron Province'],
        ['SSH', 'Lanayru Province'],
        ['FS', 'Eldin Province'],
        ['SK', 'Skyloft'],
    ]) {
        await dungeons
            .getByRole('button', { name: abbr, exact: true })
            .click({ button: 'right' });
        await expect(
            page.getByRole('region', { name: `Map: ${name}`, exact: true }),
        ).toBeVisible();
    }
    const canvas = page.getByRole('region', {
        name: 'Map: Skyloft',
        exact: true,
    });
    await expect(
        canvas.getByRole('button', { name: 'Previous map', exact: true }),
    ).toBeVisible();
    await expect(
        canvas.getByRole('button', { name: 'World map', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('banner').getByRole('button', { name: 'World map' }),
    ).toHaveCount(0);
    const previous = (await canvas
        .getByRole('button', { name: 'Previous map' })
        .boundingBox())!;
    const title = (await canvas
        .getByRole('heading', { name: 'Skyloft', exact: true })
        .boundingBox())!;
    expect(previous.x).toBeLessThan(title.x);
    expect(
        Math.abs(previous.y + previous.height / 2 - title.y - title.height / 2),
    ).toBeLessThanOrEqual(2);
    await page.getByRole('link', { name: 'Map Editor' }).click();
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Skyview' });
    await page
        .getByRole('button', { name: 'Create sub-map from group', exact: true })
        .click();
    const create = page.getByRole('dialog', {
        name: 'Create sub-map',
        exact: true,
    });
    await create.getByLabel('New map name').fill('Skyview Detail');
    await create
        .getByLabel('New map image')
        .setInputFiles(path.resolve('src/assets/maps/Faron.png'));
    await create
        .getByRole('button', { name: 'Create map', exact: true })
        .click();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'Skyview Detail',
    );
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await dungeons
        .getByRole('button', { name: 'SV', exact: true })
        .click({ button: 'right' });
    await expect(
        page.getByRole('region', { name: 'Map: Skyview Detail', exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: 'test-results/v2-dungeons.png',
        animations: 'disabled',
    });
});

test('V2 editor previews and moves a mixed selection between maps as one edit', async ({
    page,
}) => {
    const pack: import('../../src/v2/pack').MapPack =
        manualEntranceFixture().pack;
    pack.maps[1].markers.push({
        id: 'return-link',
        kind: 'link',
        label: 'Return to Door Map',
        x: 460,
        y: 250,
        targetMapId: 'root',
        navigation: 'back',
    });
    await page.goto('/v2/editor');
    await importManualEntranceFixture(page, pack);
    const editMap = (name: string) =>
        page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    const stage = page.getByTestId('map-stage');
    const count = page.getByLabel('Selected map markers');
    const signs = marker(page, 'Signs');
    const link = marker(page, 'Return to Door Map');
    await editMap('Skyview Map');
    await page.getByRole('button', { name: 'Select map markers' }).click();
    await signs.click();
    await link.click();
    const previewMove = async () => {
        const frame = (await page
            .getByTestId('map-selection-frame')
            .boundingBox())!;
        await page.mouse.click(
            frame.x + frame.width / 2,
            frame.y + frame.height / 2,
            { button: 'right' },
        );
        await page
            .getByRole('menuitem', { name: 'Move to map', exact: true })
            .click();
        const dialog = page.getByRole('dialog', { name: 'Move to map' });
        await dialog.getByLabel('Destination map').selectOption('earth');
        await dialog.getByRole('button', { name: 'Preview placement' }).click();
        await expect(stage.getByRole('img')).toHaveAttribute(
            'alt',
            'Earth Temple Map',
        );
        await expect(stage.locator('[data-transfer-marker]')).toHaveCount(2);
        await expect(signs).toHaveCount(0);
    };
    await previewMove();
    await page.keyboard.press('Escape');
    await expect(stage.getByRole('img')).toHaveAttribute('alt', 'Skyview Map');
    await expect(count).toHaveText('2 markers selected');
    await expect(signs).toBeVisible();
    await previewMove();
    const ghost = stage.locator('[data-transfer-marker="signs"]');
    const before = await ghost.evaluate(
        (element) => (element as HTMLElement).style.left,
    );
    const bounds = (await stage.boundingBox())!;
    await page.mouse.move(
        bounds.x + bounds.width * 0.7,
        bounds.y + bounds.height * 0.6,
    );
    await expect
        .poll(() =>
            ghost.evaluate((element) => (element as HTMLElement).style.left),
        )
        .not.toBe(before);
    await page.mouse.click(
        bounds.x + bounds.width * 0.7,
        bounds.y + bounds.height * 0.6,
    );
    await expect(count).toHaveText('2 markers selected');
    await expect(signs).toHaveAttribute('data-batch-selected', 'true');
    await expect(link).toHaveAttribute('data-batch-selected', 'true');
    await expect(
        page.getByTestId('map-selection-frame').getByRole('button'),
    ).toHaveCount(8);
    await expect(marker(page, 'Bell')).toBeVisible();
    await editMap('Skyview Map');
    await expect(signs).toHaveCount(0);
    await expect(link).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(signs).toBeVisible();
    await expect(link).toBeVisible();
    await editMap('Earth Temple Map');
    await expect(signs).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(signs).toBeVisible();
    await link.dblclick();
    await expect(stage.getByRole('img')).toHaveAttribute('alt', 'Door Map');
});

test('V2 marker menu copies and deletes individual markers and groups, and pastes across maps', async ({
    page,
}) => {
    const pack: import('../../src/v2/pack').MapPack =
        manualEntranceFixture().pack;
    pack.maps[1].markers.push({
        id: 'return-link',
        kind: 'link',
        label: 'Return to Door Map',
        x: 460,
        y: 250,
        targetMapId: 'root',
        navigation: 'back',
    });
    await page.goto('/v2/editor');
    await importManualEntranceFixture(page, pack);
    const editMap = (name: string) =>
        page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    const item = (name: string) =>
        page.getByRole('menuitem', { name, exact: true });
    const menu = (name: string) =>
        marker(page, name).click({ button: 'right' });
    const undo = () =>
        page.getByRole('button', { name: 'Undo', exact: true }).click();
    const stage = page.getByTestId('map-stage');
    const menuOnBackground = async () => {
        const bounds = (await stage.boundingBox())!;
        await stage.click({
            button: 'right',
            position: { x: bounds.width * 0.7, y: bounds.height * 0.65 },
        });
    };
    await editMap('Skyview Map');
    await menu('Signs');
    await expect(item('Paste')).toBeDisabled();
    await item('Copy').click();
    await menuOnBackground();
    await expect(item('Delete')).toHaveCount(0);
    await item('Paste').click();
    await expect(
        stage.getByRole('button', { name: 'Signs', exact: true }),
    ).toHaveCount(2);
    const duplicate = stage
        .locator('[data-marker-id]:not([data-marker-id="signs"])')
        .filter({ hasText: '2' });
    await duplicate.click({ button: 'right' });
    await item('Delete').click();
    await expect(duplicate).toHaveCount(0);
    await undo();
    await expect(duplicate).toBeVisible();
    await undo();
    await expect(duplicate).toHaveCount(0);

    const select = page.getByRole('button', { name: 'Select map markers' });
    await select.click();
    await marker(page, 'Signs').click();
    await marker(page, 'Return to Door Map').click();
    await menu('Signs');
    await item('Copy').click();
    await menu('Return to Door Map');
    await item('Delete').click();
    await expect(marker(page, 'Signs')).toHaveCount(0);
    await expect(marker(page, 'Return to Door Map')).toHaveCount(0);
    await undo();
    await expect(marker(page, 'Signs')).toBeVisible();
    await expect(marker(page, 'Return to Door Map')).toBeVisible();
    await editMap('Earth Temple Map');
    await menuOnBackground();
    await item('Paste').click();
    await expect(page.getByLabel('Selected map markers')).toHaveText(
        '2 markers selected',
    );
    await expect(
        stage.locator(
            '[data-marker-id="signs"], [data-marker-id="return-link"]',
        ),
    ).toHaveCount(0);
    await expect(marker(page, 'Bell')).toBeVisible();
    await undo();
    await expect(marker(page, 'Signs')).toHaveCount(0);
    await expect(marker(page, 'Return to Door Map')).toHaveCount(0);

    await editMap('Skyview Map');
    await menu('Signs');
    await item('Move to map').click();
    await page.getByLabel('Destination map').selectOption('earth');
    await page.getByRole('button', { name: 'Preview placement' }).click();
    await page.getByRole('button', { name: 'Place at map center' }).click();
    await expect(stage.locator('[data-marker-id="signs"]')).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.getByLabel('Selected map markers')).toHaveCount(0);
});

test('V2 editor selects, moves and scales placed markers without merging them', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await importManualEntranceFixture(page, manualEntranceFixture().pack);
    await page
        .getByRole('button', { name: 'Edit Skyview Map', exact: true })
        .click();
    const signs = marker(page, 'Signs');
    await signs.click();
    await page
        .getByRole('combobox', { name: 'Check timeline' })
        .selectOption('past');
    await expect(signs).toHaveAttribute('data-check-era', 'past');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(signs).not.toHaveAttribute('data-check-era', 'past');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(signs).toHaveAttribute('data-check-era', 'past');
    await expect(signs).toHaveCSS('border-top-color', 'rgb(130, 222, 255)');
    await page
        .getByRole('combobox', { name: 'Check timeline' })
        .selectOption('present');
    await expect(signs).toHaveCSS('border-top-color', 'rgb(118, 52, 168)');

    const pack: import('../../src/v2/pack').MapPack =
        manualEntranceFixture().pack;
    pack.maps[1].markers.push({
        ...pack.maps[1].markers[0],
        id: 'second-signs',
        label: 'Other signs',
        x: 520,
        y: 280,
    });
    pack.maps[1].markers.push({
        id: 'batch-link',
        kind: 'link',
        label: 'Mixed selection link',
        x: 450,
        y: 218,
        targetMapId: 'earth',
    });
    await importManualEntranceFixture(page, pack);
    await page
        .getByRole('button', { name: 'Edit Skyview Map', exact: true })
        .click();
    const other = marker(page, 'Other signs');
    const link = marker(page, 'Mixed selection link');
    const center = async (item: typeof signs) => {
        const box = (await item.boundingBox())!;
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const a = await center(signs);
    const b = await center(other);
    const originalLink = await center(link);
    await signs.click();
    await expect(
        page
            .getByRole('combobox', { name: 'Check timeline' })
            .locator('option:checked'),
    ).toHaveText('None');
    await page.getByRole('button', { name: 'Select map markers' }).click();
    await expect(page.getByLabel('Select check or link')).toHaveValue('');
    const selectionCount = page.getByLabel('Selected map markers');
    await expect(selectionCount).toHaveText('0 marker selected');
    await expect(selectionCount).toHaveCSS('margin-inline-end', '8px');
    await signs.click();
    await expect(selectionCount).toHaveText('1 marker selected');
    await signs.click();
    await page.mouse.move(a.x - 24, a.y - 24);
    await page.mouse.down();
    await page.mouse.move(b.x + 24, b.y + 24, { steps: 5 });
    await page.mouse.up();
    await expect(selectionCount).toHaveText('3 markers selected');
    await link.click();
    await expect(selectionCount).toHaveText('2 markers selected');
    await link.click();
    await expect(link).toHaveAttribute('data-batch-selected', 'true');
    const frame = page.getByTestId('map-selection-frame');
    await expect(frame.getByRole('button')).toHaveCount(8);
    const border = (await frame.boundingBox())!;
    const first = (await signs.boundingBox())!;
    const last = (await other.boundingBox())!;
    expect(first.x - border.x).toBeGreaterThan(5);
    expect(first.y - border.y).toBeGreaterThan(5);
    expect(border.x + border.width - last.x - last.width).toBeGreaterThan(5);
    expect(border.y + border.height - last.y - last.height).toBeGreaterThan(5);
    const middle = await center(frame);
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x + 30, middle.y + 45, { steps: 5 });
    await expect
        .poll(async () => Math.round((await center(link)).x - originalLink.x))
        .toBe(30);
    await page.mouse.up();
    await expect
        .poll(async () => Math.round((await center(signs)).x - a.x))
        .toBe(30);
    await expect
        .poll(async () => Math.round((await center(other)).x - b.x))
        .toBe(30);
    const resize = async (name: string, x: number, y: number) => {
        const handle = await center(
            page.getByRole('button', { name, exact: true }),
        );
        await page.mouse.move(handle.x, handle.y);
        await page.mouse.down();
        await page.mouse.move(handle.x + x, handle.y + y, { steps: 4 });
        await expect
            .poll(async () =>
                Math.hypot(
                    (
                        await center(
                            page.getByRole('button', { name, exact: true }),
                        )
                    ).x - handle.x,
                    (
                        await center(
                            page.getByRole('button', { name, exact: true }),
                        )
                    ).y - handle.y,
                ),
            )
            .toBeGreaterThan(10);
        await page.mouse.up();
    };
    await resize('Resize selection: right', 25, 10);
    await expect
        .poll(async () => Math.round((await center(other)).x - b.x))
        .toBe(55);
    await expect
        .poll(async () => Math.round((await center(other)).y - b.y))
        .toBe(45);
    await resize('Resize selection: bottom', 15, 20);
    await expect
        .poll(async () => Math.round((await center(other)).x - b.x))
        .toBe(55);
    await expect
        .poll(async () => Math.round((await center(other)).y - b.y))
        .toBe(65);
    await resize('Resize selection: top left', -20, -15);
    await expect
        .poll(async () => Math.round((await center(signs)).x - a.x))
        .toBe(10);
    await expect
        .poll(async () => Math.round((await center(signs)).y - a.y))
        .toBe(30);
    await expect
        .poll(async () => Math.round((await center(other)).x - b.x))
        .toBe(55);
    await expect
        .poll(async () => Math.round((await center(other)).y - b.y))
        .toBe(65);
    await page.screenshot({ path: 'test-results/v2-selection-handles.png' });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
        .poll(async () => Math.round((await center(other)).y - b.y))
        .toBe(45);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
        .poll(async () => Math.round((await center(signs)).x - a.x))
        .toBe(30);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
        .poll(async () => Math.round((await center(other)).x - b.x))
        .toBe(0);
    await expect
        .poll(async () => Math.round((await center(link)).x - originalLink.x))
        .toBe(0);
    await page.getByRole('button', { name: 'Select map markers' }).click();
    await link.dblclick();
    await expect(
        page.getByRole('region', {
            name: 'Map: Earth Temple Map',
            exact: true,
        }),
    ).toBeVisible();
});

test('V2 editor link tooltips count unique checks across nested sub-maps', async ({
    page,
}) => {
    const pack: import('../../src/v2/pack').MapPack =
        manualEntranceFixture().pack;
    const dump = load(fs.readFileSync('testData/sshd-dump.yaml', 'utf8')) as {
        checks: Record<string, unknown>;
    };
    const checkIds = Object.keys(dump.checks).slice(0, 1234);
    pack.maps[1].markers = [
        {
            id: 'direct',
            kind: 'checks',
            label: 'Direct',
            x: 100,
            y: 100,
            checkIds: checkIds.slice(0, 2),
        },
        {
            id: 'nested',
            kind: 'link',
            label: 'Nested',
            x: 200,
            y: 100,
            targetMapId: 'nested-map',
            navigation: 'child',
        },
        {
            id: 'return',
            kind: 'link',
            label: 'Return',
            x: 300,
            y: 100,
            targetMapId: 'root',
            navigation: 'back',
        },
        {
            id: 'passage',
            kind: 'link',
            label: 'Passage',
            x: 400,
            y: 100,
            targetMapId: 'earth',
        },
    ];
    pack.maps.push({
        id: 'nested-map',
        name: 'Nested Map',
        image: 'images/map.png',
        width: 843,
        height: 465,
        entranceIds: [],
        markers: [
            {
                id: 'nested-checks',
                kind: 'checks',
                label: 'Nested checks',
                x: 100,
                y: 100,
                checkIds,
            },
            {
                id: 'cycle',
                kind: 'link',
                label: 'Cycle',
                x: 200,
                y: 100,
                targetMapId: 'skyview',
                navigation: 'child',
            },
        ],
    });
    pack.maps[2].markers = [
        {
            id: 'other',
            kind: 'checks',
            label: 'Other region',
            x: 100,
            y: 100,
            checkIds: Object.keys(dump.checks).slice(1234, 1235),
        },
    ];
    await page.goto('/v2/editor');
    await importManualEntranceFixture(page, pack);
    const door = marker(page, 'Dungeon Door');
    await expect(door).toHaveAttribute('title', 'Dungeon Door - 1 234 checks');
    await door.dblclick();
    await expect(marker(page, 'Nested')).toHaveAttribute(
        'title',
        'Nested - 1 234 checks',
    );
    await expect(marker(page, 'Passage')).toHaveAttribute(
        'title',
        'Passage - 1 check',
    );
});

test('V2 catalogue selects and places all matches above 1000 and round-trips the full catalogue', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    const search = page.getByRole('textbox', {
        name: 'Search catalogue',
        exact: true,
    });
    const selectAll = page.getByRole('button', {
        name: 'Select all',
        exact: true,
    });
    const summary = page.getByText(/^\d+ matches · \d+ selected$/);
    await search.fill('Lanayru Gorge');
    const gorgeCount = Number((await summary.textContent())!.match(/^\d+/)![0]);
    expect(gorgeCount).toBeGreaterThan(1000);
    const placeSelected = async (count: number, x: number) => {
        await selectAll.click();
        await expect(summary).toHaveText(
            `${count} matches · ${count} selected`,
        );
        await page
            .getByRole('button', { name: 'Place selected checks', exact: true })
            .click();
        const stage = page.getByTestId('map-stage');
        const bounds = (await stage.boundingBox())!;
        await stage.click({
            position: { x: bounds.width * x, y: bounds.height * 0.95 },
        });
        await expect(
            page.getByText(`${count} checks`, { exact: true }),
        ).toBeVisible();
    };
    await placeSelected(gorgeCount, 0.5);
    await search.fill('');
    const total = Number((await summary.textContent())!.match(/^\d+/)![0]);
    expect(total).toBeGreaterThan(15000);
    await placeSelected(total, 0.7);
    const download = page.waitForEvent('download');
    await page
        .getByRole('button', { name: 'Export pack', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Download ZIP', exact: true })
        .click();
    const filename = (await (await download).path())!;
    const archive = unzipSync(fs.readFileSync(filename));
    const saved = JSON.parse(strFromU8(archive['pack.json']));
    const groups = saved.maps
        .flatMap(
            (map: { markers: { label: string; checkIds?: string[] }[] }) =>
                map.markers,
        )
        .filter((entry: { label: string }) => entry.label === 'Multi-check');
    expect(
        groups.map((entry: { checkIds: string[] }) => entry.checkIds.length),
    ).toEqual([gorgeCount, total]);
    await page
        .getByLabel('Import pack', { exact: true })
        .setInputFiles(filename);
    await expect(
        page.getByRole('status').filter({ hasText: 'Map pack imported.' }),
    ).toBeVisible();
});

for (const route of ['/v2', '/v2/editor']) {
    test(`V2 wheel zoom keeps the map point under the cursor on ${route}`, async ({
        page,
    }) => {
        await page.goto(route);
        const viewport = page.getByTestId('map-viewport');
        const stage = page.getByTestId('map-stage');
        await expect(stage).toBeVisible();
        const zoom = page.getByLabel('Map zoom', { exact: true });
        const image = stage.locator('img');
        await expect
            .poll(() =>
                image.evaluate(
                    (element: HTMLImageElement) =>
                        element.complete && element.naturalWidth > 0,
                ),
            )
            .toBe(true);
        await setMapZoom(page, 305);
        await viewport.evaluate((element) => {
            element.scrollLeft =
                (element.scrollWidth - element.clientWidth) / 2;
            element.scrollTop =
                (element.scrollHeight - element.clientHeight) / 2;
        });
        const view = (await viewport.boundingBox())!;
        const pointer = {
            x: view.x + view.width * 0.65,
            y: view.y + view.height * 0.6,
        };
        await page.mouse.move(pointer.x, pointer.y);
        for (const delta of [-600, 250, -200]) {
            const before = (await stage.boundingBox())!;
            const point = {
                x: (pointer.x - before.x) / before.width,
                y: (pointer.y - before.y) / before.height,
            };
            const previousZoom = await zoom.textContent();
            await page.mouse.wheel(0, delta);
            await expect(zoom).not.toHaveText(previousZoom!);
            await expect
                .poll(async () => {
                    const after = (await stage.boundingBox())!;
                    return Math.hypot(
                        after.x + point.x * after.width - pointer.x,
                        after.y + point.y * after.height - pointer.y,
                    );
                })
                .toBeLessThan(2);
        }
    });
}

test('V2 zoom stays between 100 and 1000 percent with the slider and wheel', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    const zoom = page.getByLabel('Map zoom', { exact: true });
    await expect(zoom).toHaveText('100%');
    await zoom.click();
    const slider = page.getByRole('slider', { name: 'Zoom level' });
    await expect(slider).toHaveCSS('writing-mode', 'vertical-lr');
    await expect(slider).toHaveAttribute('min', '100');
    await expect(slider).toHaveAttribute('max', '1000');
    await slider.press('Escape');
    const stage = page
        .getByRole('region', { name: 'Map: The Sky', exact: true })
        .getByTestId('map-stage');
    await stage.hover({ position: { x: 100, y: 100 } });
    await page.mouse.wheel(0, -10000);
    await expect(zoom).toHaveText('1000%');
    await page.mouse.wheel(0, 10000);
    await expect(zoom).toHaveText('100%');
    await setMapZoom(page, 1000);
    await expect(zoom).toHaveText('1000%');
    await page.getByRole('button', { name: 'Fit map', exact: true }).click();
    await expect(zoom).toHaveText('100%');
});

test('V2 editor drags a member out of a group and rejects invalid imports without data loss', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    await page
        .getByRole('button', { name: 'Edit Faron Province', exact: true })
        .click();
    await page
        .getByLabel('Select check or link')
        .selectOption({ label: 'Faron Woods' });
    const sourceSelection = await page
        .getByLabel('Select check or link')
        .inputValue();
    await page
        .getByLabel('Search group members')
        .fill('Faron Woods - Chest behind Upper Bombable Rock');
    const member = page.getByRole('checkbox', {
        name: 'Faron Woods - Chest behind Upper Bombable Rock',
        exact: true,
    });
    const bounds = (await page.getByTestId('map-stage').boundingBox())!;
    await member
        .locator('..')
        .locator('..')
        .dragTo(page.getByTestId('map-stage'), {
            targetPosition: { x: bounds.width * 0.8, y: bounds.height * 0.8 },
        });
    await expect(
        marker(page, 'Faron Woods - Chest behind Upper Bombable Rock'),
    ).toBeVisible();
    await expect(page.getByLabel('Select check or link')).toHaveValue(
        sourceSelection,
    );
    await expect(page.getByLabel('Search group members')).toHaveValue(
        'Faron Woods - Chest behind Upper Bombable Rock',
    );
    await marker(
        page,
        'Faron Woods - Chest behind Upper Bombable Rock',
    ).click();
    await expect(page.getByLabel('Select check or link')).not.toHaveValue(
        sourceSelection,
    );
    await page.getByLabel('Import pack', { exact: true }).setInputFiles({
        name: 'invalid.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from(
            zipSync({ 'pack.json': strToU8('{"version":999}') }),
        ),
    });
    await expect(
        page
            .getByRole('status')
            .filter({ hasText: 'Unsupported map pack version' }),
    ).toBeVisible();
    await expect(
        marker(page, 'Faron Woods - Chest behind Upper Bombable Rock'),
    ).toBeVisible();
    await page.setViewportSize({ width: 600, height: 820 });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: 'test-results/v2-editor-mobile.png',
        animations: 'disabled',
        fullPage: true,
    });

    await page.getByRole('button', { name: 'New pack', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'New map pack' });
    await expect(
        create.getByText(/Changes you have not exported will be lost/),
    ).toBeVisible();
    await page.screenshot({
        path: 'test-results/v2-new-pack.png',
        animations: 'disabled',
    });
    await expect(create.getByLabel('New map image')).toHaveCount(0);
    await expect(create.getByLabel('New map name')).toHaveCount(0);
    await create.getByLabel('New pack name').fill('Fresh V1 pack');
    await create.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
        marker(page, 'Faron Woods - Chest behind Upper Bombable Rock'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'New pack', exact: true }).click();
    await create.getByLabel('New pack name').fill('Fresh V1 pack');
    await create
        .getByRole('button', { name: 'Create pack', exact: true })
        .click();
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(
        'The Sky',
    );
    await expect(page.getByLabel('Pack name', { exact: true })).toHaveValue(
        'Fresh V1 pack',
    );
    await expect(page.locator('[aria-label="Maps"] > button')).toHaveCount(5);
    await expect(
        page.getByRole('button', { name: 'Load V1 layout', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByText('15016/15016 checks placed', { exact: true }),
    ).toHaveCSS('color', 'rgb(35, 131, 70)');
    await expect(
        page.getByRole('status').filter({ hasText: 'Unexported changes' }),
    ).toHaveAttribute('data-state', 'pending');
});
