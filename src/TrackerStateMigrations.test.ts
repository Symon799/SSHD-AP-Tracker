import { describe, expect, it } from 'vitest';
import { migrateTrackerState } from './TrackerStateMigrations';
import type { TrackerState } from './tracker/Slice';

function makeTrackerState(overrides: Partial<TrackerState>): TrackerState {
    return {
        checkedChecks: [],
        apCheckedChecks: [],
        manualCheckedOverrides: {},
        inventory: {},
        apInventory: {},
        manualInventoryOverrides: {},
        hasBeenModified: true,
        mappedExits: {},
        requiredDungeons: [],
        apRequiredDungeons: [],
        manualRequiredDungeonOverrides: {},
        hints: {},
        checkHints: {},
        settings: {},
        userHintsText: '',
        ...overrides,
    };
}

describe('migrateTrackerState', () => {
    it('preserves saved required dungeons when continuing a session', () => {
        const migrated = migrateTrackerState(
            makeTrackerState({
                requiredDungeons: ['Skyview', 'Sandship'],
                manualRequiredDungeonOverrides: {
                    'Earth Temple': false,
                },
            }),
            { preserveRequiredDungeonSelection: true },
        );

        expect(migrated.requiredDungeons).toEqual(['Skyview', 'Sandship']);
        expect(
            [...migrated.apRequiredDungeons].sort((a, b) => a.localeCompare(b)),
        ).toEqual(
            ['Earth Temple', 'Sandship', 'Skyview'].sort((a, b) =>
                a.localeCompare(b),
            ),
        );
    });

    it('migrates legacy absolute inventory overrides to deltas', () => {
        const migrated = migrateTrackerState(
            makeTrackerState({
                apInventory: { 'Progressive Sword': 2 },
                manualInventoryOverrides: { 'Progressive Sword': 3 },
                inventory: { 'Progressive Sword': 3 },
            }),
        );

        expect(migrated.inventoryOverrideDeltas).toBe(true);
        expect(migrated.manualInventoryOverrides).toEqual({
            'Progressive Sword': 1,
        });
        expect(migrated.inventory['Progressive Sword']).toBe(3);
    });
});
