import { expect, test, type Page } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { load } from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

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
    const before = await diagnostics.getByText(/^Sequence:/).textContent();
    await page.getByPlaceholder('Enter a command here').fill(command);
    await page.getByPlaceholder('Enter a command here').press('Enter');
    if (ignored)
        await expect(diagnostics).toContainText('Ignored invalid telemetry');
    else
        await expect(diagnostics.getByText(/^Sequence:/)).not.toHaveText(
            before!,
        );
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
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const stage = page.getByTestId('map-stage');
    const bounds = (await stage.boundingBox())!;
    const x = bounds.x + bounds.width * 0.8,
        y = bounds.y + bounds.height * 0.8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 45, y - 35, { steps: 5 });
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.up();
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
            .getByRole('combobox', { name: 'Add arrival to map', exact: true })
            .fill(query);
        await page.getByRole('option', { name: option, exact: true }).click();
        await expect(
            page.getByRole('heading', {
                name: 'Arrivals on this map (1)',
                exact: true,
            }),
        ).toBeVisible();
    }
    await page
        .getByRole('button', { name: 'Edit Door Map', exact: true })
        .click();
    await page
        .getByRole('combobox', { name: 'Add arrival to map', exact: true })
        .fill('earth temple eldin');
    await expect(
        page.getByRole('option', {
            name: 'Earth Temple (via Eldin Volcano) — Earth Temple Map',
            exact: true,
        }),
    ).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
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
    await page
        .getByRole('combobox', { name: 'Add arrival to map', exact: true })
        .fill('Skyview Temple Deep Woods');
    await page
        .getByRole('option', {
            name: 'Skyview Temple (via Deep Woods)',
            exact: true,
        })
        .click();
    await page
        .getByRole('button', {
            name: `Remove arrival ${arrivalA}`,
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('heading', {
            name: 'Arrivals on this map (0)',
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
        page.getByRole('heading', {
            name: 'Arrivals on this map (1)',
            exact: true,
        }),
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
    await expect(follow).toHaveAttribute('aria-pressed', 'false');
    await follow.click();
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
        await page.getByText('Auto map following (0)', { exact: true }).click();
        await page.getByLabel('Tracking stage').fill('F000');
        await page.getByLabel('Tracking Room', { exact: true }).fill(room);
        await page.getByLabel('Tracking Layer', { exact: true }).fill(layer);
        await page
            .getByRole('button', { name: 'Add rule', exact: true })
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
    await page.getByRole('link', { name: 'Preview Tracker' }).click();
    await page
        .getByRole('button', { name: 'Follow player', exact: true })
        .click();
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

test('V2 zoom stays between 100 and 1000 percent with buttons and the wheel', async ({
    page,
}) => {
    await page.goto('/v2/editor');
    const zoom = page.getByLabel('Map zoom', { exact: true });
    await expect(zoom).toHaveText('100%');
    await expect(
        page.getByRole('button', { name: 'Zoom out', exact: true }),
    ).toBeDisabled();
    const stage = page
        .getByRole('region', { name: 'Map: The Sky', exact: true })
        .getByTestId('map-stage');
    await stage.hover({ position: { x: 100, y: 100 } });
    await page.mouse.wheel(0, -10000);
    await expect(zoom).toHaveText('1000%');
    await expect(
        page.getByRole('button', { name: 'Zoom in', exact: true }),
    ).toBeDisabled();
    await page.mouse.wheel(0, 10000);
    await expect(zoom).toHaveText('100%');
    for (let i = 0; i < 11; i++)
        await page
            .getByRole('button', { name: 'Zoom in', exact: true })
            .click();
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
