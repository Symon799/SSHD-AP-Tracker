import { describe, expect, it } from 'vitest';
import type { TypedOptions } from '../permalink/SettingsTypes';
import { getInitialItems } from './TrackerModifications';

function makeSettings(
    overrides: Partial<TypedOptions>,
): Parameters<typeof getInitialItems>[0] {
    return {
        'starting-sword': 'no_sword',
        'starting-items': [],
        'starting-tablet-count': 0,
        'starting-crystal-packs': 0,
        'starting-tadtones': 0,
        'starting-bottles': 0,
        ...overrides,
    } as Parameters<typeof getInitialItems>[0];
}

describe('getInitialItems', () => {
    it('keeps Sailcloth for old worlds and unshuffled Sailcloth seeds', () => {
        expect(getInitialItems(makeSettings({}))['Sailcloth']).toBe(1);
        expect(
            getInitialItems(makeSettings({ 'randomize-sailcloth': false }))[
                'Sailcloth'
            ],
        ).toBe(1);
    });

    it('starts without Sailcloth when it is randomized', () => {
        expect(
            getInitialItems(makeSettings({ 'randomize-sailcloth': true }))[
                'Sailcloth'
            ] ?? 0,
        ).toBe(0);
    });

    it('uses the resolved Loftwing start option', () => {
        expect(getInitialItems(makeSettings({}))['Loftwing']).toBe(1);
        expect(
            getInitialItems(makeSettings({ 'randomize-loftwing': 'on' }))[
                'Loftwing'
            ],
        ).toBe(1);
        expect(
            getInitialItems(makeSettings({ 'randomize-loftwing': 'off' }))[
                'Loftwing'
            ] ?? 0,
        ).toBe(0);
    });

    it.each([1, 2])('resolves %i starting Progressive Loftwings', (count) => {
        const inventory = getInitialItems(
            makeSettings({
                'randomize-loftwing': 'off',
                'starting-items': Array<string>(count).fill(
                    'Progressive Loftwing',
                ),
            }),
        );
        expect(inventory.Loftwing).toBe(1);
        expect(inventory['Spiral Charge'] ?? 0).toBe(count === 2 ? 1 : 0);
        expect(inventory['Progressive Loftwing']).toBeUndefined();
    });

    it('starts without a progressive sword when starting-sword is no_sword', () => {
        expect(
            getInitialItems(makeSettings({ 'starting-sword': 'no_sword' }))[
                'Progressive Sword'
            ],
        ).toBe(0);
    });

    it('starts with practice sword tier when starting-sword is practice_sword', () => {
        expect(
            getInitialItems(
                makeSettings({ 'starting-sword': 'practice_sword' }),
            )['Progressive Sword'],
        ).toBe(1);
    });

    it('does not include a progressive pouch when starting-items is empty', () => {
        expect(
            getInitialItems(makeSettings({ 'starting-items': [] }))[
                'Progressive Pouch'
            ] ?? 0,
        ).toBe(0);
    });

    it('includes progressive pouch entries from starting-items', () => {
        expect(
            getInitialItems(
                makeSettings({ 'starting-items': ['Progressive Pouch'] }),
            )['Progressive Pouch'],
        ).toBe(1);
    });
});
