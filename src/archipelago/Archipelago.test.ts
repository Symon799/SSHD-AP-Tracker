import { load } from 'js-yaml';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OptionDefs } from '../permalink/SettingsTypes';
import {
    AP_ITEM_ID_GRATITUDE_CRYSTAL,
    AP_ITEM_ID_GRATITUDE_CRYSTAL_PACK,
    applyApItemToTrackerInventory,
    formatRequiredDungeonsDebugSummary,
    isApBottleSlotItem,
    mergeApInventoryWithSeedItems,
    optionIndicesToOptions,
    parseApCustomStartingItems,
    parseGratitudeCrystalCountsFromReceivedItems,
    parseGratitudeCrystalDataStorage,
    parseProgressiveSwordDataStorage,
    type RequiredDungeonDiagnostic,
} from './Archipelago';

describe('optionIndicesToOptions', () => {
    const options = load(
        fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
    ) as OptionDefs;

    it('maps AP dungeon and trial aliases to SSHD entrance settings', () => {
        const settings = optionIndicesToOptions(options, {
            option_randomize_dungeons: 1,
            option_randomize_trials: 1,
        });

        expect(settings['randomize-dungeon-entrances']).toBe('on');
        expect(settings['randomize-trial-gate-entrances']).toBe('on');
    });

    it('maps AP random spawn index 1 to anywhere', () => {
        const settings = optionIndicesToOptions(options, {
            option_random_starting_spawn: 1,
        });

        expect(settings['random-starting-spawn']).toBe('anywhere');
    });
});

describe('formatRequiredDungeonsDebugSummary', () => {
    const baseDiagnostic = {
        slotDataKeys: [],
        keysContainingRequired: [],
        requiredDungeonsRaw: undefined,
        goalDungeonLocationCodesRaw: undefined,
        requiredDungeons: ['Skyview', 'Sandship'],
        source: 'goal_dungeon_location_codes',
        hasSpecificRequiredDungeons: true,
        pendingGoalLocationCodes: false,
        verdict: '',
    } satisfies RequiredDungeonDiagnostic;

    it('lists AP-required dungeons from server data when present', () => {
        expect(formatRequiredDungeonsDebugSummary(baseDiagnostic)).toBe(
            'Skyview, Sandship',
        );
    });

    it('does not change when the player toggles dungeons in the tracker', () => {
        expect(
            formatRequiredDungeonsDebugSummary({
                ...baseDiagnostic,
                requiredDungeons: ['Skyview', 'Sandship'],
            }),
        ).toBe('Skyview, Sandship');
    });

    it('reports when no specific dungeons came from AP', () => {
        expect(
            formatRequiredDungeonsDebugSummary({
                ...baseDiagnostic,
                hasSpecificRequiredDungeons: false,
                source: 'default',
            }),
        ).toBe('No specific required dungeon found');
    });
});

describe('parseApCustomStartingItems', () => {
    it('expands AP custom starting items without the default progressive pouch', () => {
        expect(
            parseApCustomStartingItems({
                'Skyview Temple Map': 1,
                'Earth Temple Map': 1,
            }),
        ).toEqual(['Skyview Map', 'Earth Temple Map']);
    });
});

describe('parseGratitudeCrystalDataStorage', () => {
    it('reads flat gratitude crystal keys', () => {
        expect(
            parseGratitudeCrystalDataStorage({
                'Gratitude Crystal': 12,
                'Gratitude Crystal Pack': 2,
            }),
        ).toEqual({ singles: 12, packs: 2 });
    });

    it('reads team and slot scoped keys', () => {
        expect(
            parseGratitudeCrystalDataStorage({
                'Gratitude Crystal_0_2': 4,
                'Gratitude Crystal Pack_0_2': 1,
            }),
        ).toEqual({ singles: 4, packs: 1 });
    });

    it('sums nested gratitude crystal entries', () => {
        expect(
            parseGratitudeCrystalDataStorage({
                'Gratitude Crystal': {
                    '2773020': 1,
                    '2773021': 1,
                    '2773051': 1,
                },
                'Gratitude Crystal Pack': {
                    '2773061': 1,
                    '2773070': 1,
                },
            }),
        ).toEqual({ singles: 3, packs: 2 });
    });

    it('reads nested count objects', () => {
        expect(
            parseGratitudeCrystalDataStorage({
                gratitude_crystal_0_2: { count: 7 },
                gratitude_crystal_pack_0_2: { amount: 3 },
            }),
        ).toEqual({ singles: 7, packs: 3 });
    });

    it('ignores unrelated slot_data options', () => {
        expect(
            parseGratitudeCrystalDataStorage({
                option_gratitude_crystal_shuffle: 1,
            }),
        ).toBeUndefined();
    });
});

describe('parseGratitudeCrystalCountsFromReceivedItems', () => {
    it('counts all gratitude items in receivedNetworkItems', () => {
        expect(
            parseGratitudeCrystalCountsFromReceivedItems([
                {
                    item: AP_ITEM_ID_GRATITUDE_CRYSTAL,
                    location: 2773020,
                    player: 2,
                    flags: 0,
                },
                {
                    item: AP_ITEM_ID_GRATITUDE_CRYSTAL_PACK,
                    location: 2773068,
                    player: 2,
                    flags: 1,
                },
                {
                    item: AP_ITEM_ID_GRATITUDE_CRYSTAL,
                    location: 14041140,
                    player: 1,
                    flags: 0,
                },
            ]),
        ).toEqual({ singles: 2, packs: 1 });
    });
});

describe('applyApItemToTrackerInventory', () => {
    it('maps a dungeon key ring to every small key for that dungeon', () => {
        const inventory: Record<string, number> = {};
        applyApItemToTrackerInventory(inventory, 'Fire Sanctuary Key Ring');
        expect(inventory['Fire Sanctuary Small Key']).toBe(3);
    });

    it('maps the Skeleton Key to all dungeon and Lanayru Caves keys', () => {
        const inventory: Record<string, number> = {};
        applyApItemToTrackerInventory(inventory, 'Skeleton Key');
        expect(inventory['Skyview Small Key']).toBe(2);
        expect(inventory['Fire Sanctuary Small Key']).toBe(3);
        expect(inventory['Lanayru Caves Small Key']).toBe(2);
    });

    it('counts filled bottle items as empty bottles', () => {
        const inventory: Record<string, number> = {};
        applyApItemToTrackerInventory(inventory, 'Bottle of Water');
        applyApItemToTrackerInventory(inventory, 'Heart Potion Plus Plus');
        expect(inventory['Empty Bottle']).toBe(2);
        expect(inventory['Bottle of Water']).toBeUndefined();
        expect(inventory['Heart Potion Plus Plus']).toBeUndefined();
    });

    it('counts empty bottle variants from AP', () => {
        const inventory: Record<string, number> = {};
        applyApItemToTrackerInventory(inventory, 'Empty Bottle');
        applyApItemToTrackerInventory(inventory, 'Empty Bottle #2');
        expect(inventory['Empty Bottle']).toBe(2);
    });

    it('maps bottle of mushroom spores alias', () => {
        expect(isApBottleSlotItem('Bottle of Mushroom Spores')).toBe(true);
        const inventory: Record<string, number> = {};
        applyApItemToTrackerInventory(inventory, 'Bottle of Mushroom Spores');
        expect(inventory['Empty Bottle']).toBe(1);
    });

    it('requires four Song of the Hero parts for the completed song', () => {
        const inventory: Record<string, number> = {};
        for (let i = 0; i < 3; i++) {
            applyApItemToTrackerInventory(inventory, 'Song of the Hero Part');
        }
        expect(inventory['Song of the Hero']).toBe(3);

        applyApItemToTrackerInventory(inventory, 'Song of the Hero');
        expect(inventory['Song of the Hero']).toBe(4);
    });
});

describe('mergeApInventoryWithSeedItems', () => {
    it('does not double-count starting empty bottles on AP resync', () => {
        expect(
            mergeApInventoryWithSeedItems(
                { 'Empty Bottle': 2 },
                { 'Empty Bottle': 2 },
            )['Empty Bottle'],
        ).toBe(2);
    });

    it('keeps progressive items at the highest reconstructed level', () => {
        expect(
            mergeApInventoryWithSeedItems(
                { 'Progressive Mitts': 1 },
                { 'Progressive Mitts': 2 },
            )['Progressive Mitts'],
        ).toBe(2);
    });

    it('adds non-progressive stackables on top of seed items once', () => {
        expect(
            mergeApInventoryWithSeedItems({ Whip: 0 }, { Whip: 1 }).Whip,
        ).toBe(1);
    });
});

describe('parseProgressiveSwordDataStorage', () => {
    it('reads flat progressive sword keys', () => {
        expect(
            parseProgressiveSwordDataStorage({
                'Progressive Sword': 4,
            }),
        ).toBe(4);
    });

    it('reads team and slot scoped keys', () => {
        expect(
            parseProgressiveSwordDataStorage({
                progressive_sword_0_2: 5,
            }),
        ).toBe(5);
    });

    it('ignores unrelated slot_data options', () => {
        expect(
            parseProgressiveSwordDataStorage({
                option_starting_sword: 2,
            }),
        ).toBeUndefined();
    });
});
