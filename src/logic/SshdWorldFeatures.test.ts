import { load } from 'js-yaml';
import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    applyApItemToTrackerInventory,
    mergeApInventoryWithSeedItems,
    optionIndicesToOptions,
} from '../archipelago/Archipelago';
import { buildSshdApLocationResolver } from '../archipelago/locationMapping';
import features from '../data/sshdWorldFeatures.json';
import { defaultSettings } from '../permalink/Settings';
import type { OptionDefs, TypedOptions } from '../permalink/SettingsTypes';
import { createStore } from '../store/Store';
import {
    apCountedCheckIdsSelector,
    areasSelector,
    isCheckBannedSelector,
} from '../tracker/Selectors';
import { reset, syncApCheckedChecks } from '../tracker/Slice';
import { computeLeastFixedPoint, mergeRequirements } from './bitlogic/BitLogic';
import { getExitRules, getExits } from './Entrances';
import { birdStatueItems } from './Inventory';
import { defaultRequiredDungeons } from './Locations';
import { parseLogic } from './Logic';
import { mapInventory, mapSettings } from './Mappers';
import { getAdditionalItems } from './Misc';
import { loadLogic } from './Slice';
import { getInitialItems } from './TrackerModifications';
import type { RawLogic } from './UpstreamTypes';
import { isVegetationType } from './Vegetation';

const raw = load(
    fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
) as RawLogic;
const options = load(
    fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
) as OptionDefs;
let logic: ReturnType<typeof parseLogic>;
beforeAll(() => {
    logic = parseLogic(raw);
});

function reachableBits(
    inventory: Record<string, number>,
    overrides: Partial<TypedOptions> = {},
    checked: string[] = [],
    optimized = false,
) {
    const settings = { ...defaultSettings(options), ...overrides };
    const dungeons = defaultRequiredDungeons();
    const exits = getExits(
        logic,
        getExitRules(
            logic,
            settings['random-start-entrance'],
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            settings['randomize-trials'],
            settings['random-start-statues'],
            settings['empty-unrequired-dungeons'],
            dungeons,
            settings,
        ),
        {},
    );
    return computeLeastFixedPoint(
        'feature test',
        mergeRequirements(
            logic.numRequirements,
            optimized ? logic.staticRequirements : logic.rawStaticRequirements,
            mapInventory(logic, inventory),
            mapInventory(
                logic,
                getAdditionalItems(
                    logic,
                    inventory,
                    new Set(checked),
                    settings,
                ),
            ),
            mapSettings(logic, options, settings, exits, dungeons),
        ),
    );
}

function reachable(...args: Parameters<typeof reachableBits>) {
    const bits = reachableBits(...args);
    return (id: string) => {
        expect(logic.itemBits[id], `Unknown requirement ${id}`).toBeDefined();
        return bits.test(logic.itemBits[id]);
    };
}

function stateWith(overrides: Partial<TypedOptions> = {}) {
    const store = createStore();
    store.dispatch(
        loadLogic({
            logic: raw,
            options,
            presets: {},
            remote: { type: 'localSshd' },
            remoteName: 'SSHD',
        }),
    );
    store.dispatch(
        reset({ settings: { ...defaultSettings(options), ...overrides } }),
    );
    return store.getState();
}

describe('SSHD vegetation checks', () => {
    it('maps all vegetation to real regions while sharing only reachability', () => {
        const counts = { grass: 0, grass_blade: 0, tree: 0, sign: 0 };
        for (const [id, check] of Object.entries(logic.checks)) {
            if (!isVegetationType(check.type)) continue;
            counts[check.type]++;
            expect(logic.itemBits[id]).toBeDefined();
            expect(check.area).toBeTruthy();
            expect(logic.checksByHintRegion[check.area!]).toContain(id);
        }
        expect(counts).toEqual({
            grass: 854,
            grass_blade: 12579,
            tree: 91,
            sign: 8,
        });
        expect(logic.numRequirements).toBeLessThan(6000);
    });

    it.each([
        { grass: 0, tree: 0, counts: { grass: 0, grass_blade: 0, tree: 0 } },
        { grass: 1, tree: 0, counts: { grass: 854, grass_blade: 0, tree: 0 } },
        {
            grass: 2,
            tree: 1,
            counts: { grass: 0, grass_blade: 12579, tree: 91 },
        },
        { grass: 0, tree: 1, counts: { grass: 0, grass_blade: 0, tree: 91 } },
    ])(
        'counts only the selected AP modes: grass=$grass, tree=$tree',
        ({ grass, tree, counts }) => {
            const settings = optionIndicesToOptions(options, {
                option_grass_shuffle: grass,
                option_tree_shuffle: tree,
            });
            const state = stateWith(settings);
            const actual = { grass: 0, grass_blade: 0, tree: 0, sign: 0 };
            for (const id of apCountedCheckIdsSelector(state)) {
                const type = logic.checks[id].type;
                if (isVegetationType(type)) actual[type]++;
            }
            expect(actual).toEqual({ ...counts, sign: 0 });
        },
    );

    it('keeps grass cutting alternatives separate from tree requirements', () => {
        const base = { Loftwing: 1, Sailcloth: 1 };
        const grass =
            '\\Skyloft\\Central Skyloft\\Central Skyloft - Grass Patch 1';
        const blade = `${grass} - Blade 1`;
        const tree = '\\Skyloft\\Central Skyloft\\Central Skyloft - Tree 1';
        for (const optimized of [false, true]) {
            expect(reachable(base, {}, [], optimized)(grass)).toBe(false);
            expect(
                reachable({ ...base, Whip: 1 }, {}, [], optimized)(grass),
            ).toBe(true);
            expect(
                reachable({ ...base, Whip: 1 }, {}, [], optimized)(blade),
            ).toBe(true);
            expect(
                reachable({ ...base, Whip: 1 }, {}, [], optimized)(tree),
            ).toBe(false);
            expect(
                reachable({ ...base, 'Bomb Bag': 1 }, {}, [], optimized)(tree),
            ).toBe(true);
        }
    });

    it('synchronizes blades independently even when their access is shared', () => {
        const store = createStore();
        store.dispatch(
            loadLogic({
                logic: raw,
                options,
                presets: {},
                remote: { type: 'localSshd' },
                remoteName: 'SSHD',
            }),
        );
        store.dispatch(
            reset({
                settings: {
                    ...defaultSettings(options),
                    'grass-shuffle': 'blades',
                },
            }),
        );
        const first =
            '\\Skyloft\\Central Skyloft\\Central Skyloft - Grass Patch 1 - Blade 1';
        const second =
            '\\Skyloft\\Central Skyloft\\Central Skyloft - Grass Patch 1 - Blade 2';
        expect(logic.itemBits[first]).toBe(logic.itemBits[second]);
        store.dispatch(syncApCheckedChecks([first]));
        expect(store.getState().tracker.checkedChecks).toEqual([first]);
        expect(store.getState().tracker.checkedChecks).not.toContain(second);
    });
});

describe('SSHD sign shuffle', () => {
    it.each([undefined, 0, 1])(
        'counts signs only when enabled: %s',
        (value) => {
            const settings = optionIndicesToOptions(
                options,
                value === undefined ? {} : { option_sign_shuffle: value },
            );
            const state = stateWith(settings);
            const signs = apCountedCheckIdsSelector(state).filter(
                (id) => logic.checks[id].type === 'sign',
            );
            expect(signs).toHaveLength(value === 1 ? 8 : 0);
        },
    );

    it('resolves all sign names from AP to their actual regions', () => {
        const resolver = buildSshdApLocationResolver(logic);
        for (const [id, check] of Object.entries(logic.checks)) {
            if (check.type !== 'sign') continue;
            expect(resolver(check.name)).toBe(id);
            expect(check.area).toBe(
                check.name.startsWith('Central Skyloft')
                    ? 'Central Skyloft'
                    : 'Sky',
            );
        }
    });

    it('accepts all six confirmed attacks but not unrelated grass cutting tools', () => {
        const sign = '\\Skyloft\\Central Skyloft\\Central Skyloft - Sign 1';
        const base = { Loftwing: 1, Sailcloth: 1 };
        for (const optimized of [false, true]) {
            expect(reachable(base, {}, [], optimized)(sign)).toBe(false);
            expect(
                reachable({ ...base, Whip: 1 }, {}, [], optimized)(sign),
            ).toBe(false);
            expect(
                reachable(
                    { ...base, 'Progressive Beetle': 1 },
                    {},
                    [],
                    optimized,
                )(sign),
            ).toBe(false);
            for (const tool of [
                'Progressive Sword',
                'Gust Bellows',
                'Progressive Slingshot',
                'Clawshots',
                'Progressive Bow',
                'Bomb Bag',
            ]) {
                expect(
                    reachable({ ...base, [tool]: 1 }, {}, [], optimized)(sign),
                    tool,
                ).toBe(true);
            }
        }
    });
});

describe('SSHD post-Fire-Dragon pots', () => {
    it.each([
        { area: 'Bokoblin Base Summit', first: 1, last: 12, neighbor: 13 },
        {
            area: 'Bokoblin Base Upper Eldin Cave',
            first: 13,
            last: 24,
            neighbor: 12,
        },
        { area: 'Bokoblin Base Prison', first: 19, last: 30, neighbor: 18 },
    ])(
        'gates only the post-reward pots in $area',
        ({ area, first, last, neighbor }) => {
            const inventory = {
                Loftwing: 1,
                Sailcloth: 1,
                'Ruby Tablet': 1,
                'Progressive Mitts': 2,
                Clawshots: 1,
                Whip: 1,
                'Bomb Bag': 1,
                'Progressive Slingshot': 1,
                'Progressive Sword': 2,
            };
            const scenarios: {
                items: Record<string, number>;
                accessible: boolean;
            }[] = [
                { items: {}, accessible: false },
                { items: { 'Fireshield Earrings': 1 }, accessible: false },
                { items: { 'Progressive Bow': 1 }, accessible: false },
                { items: { 'Progressive Beetle': 1 }, accessible: false },
                {
                    items: { 'Fireshield Earrings': 1, 'Progressive Bow': 1 },
                    accessible: true,
                },
                {
                    items: {
                        'Fireshield Earrings': 1,
                        'Progressive Beetle': 1,
                    },
                    accessible: true,
                },
            ];
            for (const optimized of [false, true]) {
                for (const { items, accessible } of scenarios) {
                    const access = reachable(
                        { ...inventory, ...items },
                        {},
                        [],
                        optimized,
                    );
                    const scenario = `${area}, optimized=${optimized}, ${JSON.stringify(items)}`;
                    expect(access('\\Beaten Boko Base'), scenario).toBe(
                        accessible,
                    );
                    expect(
                        access(
                            "\\Eldin\\Fire Dragon's Lair\\Bokoblin Base - Fire Dragon's Reward",
                        ),
                    ).toBe(accessible);
                    for (let number = first; number <= last; number++) {
                        expect(
                            access(`\\Eldin\\${area}\\${area} - Pot ${number}`),
                        ).toBe(accessible);
                    }
                }
            }
            expect(
                raw.areas.sub_areas.Eldin.sub_areas[area].locations![
                    `${area} - Pot ${neighbor}`
                ],
            ).toBe('True');
            const firstRoom =
                raw.areas.sub_areas.Eldin.sub_areas['Volcano First Room'];
            for (const number of [3, 4, 5]) {
                expect(
                    firstRoom.locations![`Volcano First Room - Pot ${number}`],
                ).toBe('True');
            }
        },
    );
});

describe('SSHD bird statues and goddess chest options', () => {
    it('maps every statue check to an existing region and inventory item', () => {
        const resolve = buildSshdApLocationResolver(logic);
        const regions = areasSelector(
            stateWith({ 'bird-statues-give-items': 'on' }),
        );
        expect(birdStatueItems).toHaveLength(28);
        for (const statue of features.statues) {
            expect(birdStatueItems).toContain(statue.item);
            const id = resolve(statue.location)!;
            expect(id).toBe(
                `\\${statue.world}\\${statue.area}\\${statue.location}`,
            );
            expect(logic.checks[id].type).toBe('bird_statue');
            const region = regions.find(
                (entry) => entry.name === logic.checks[id].area,
            );
            expect(region?.checks.list).toContain(id);
        }
    });

    it('counts statue checks and cube checks independently of chest shuffle', () => {
        const baseline = apCountedCheckIdsSelector(stateWith());
        const statues = apCountedCheckIdsSelector(
            stateWith({ 'bird-statues-give-items': 'on' }),
        );
        const cubes = apCountedCheckIdsSelector(
            stateWith({
                'decouple-goddess-cubes-and-chests': 'on',
                'goddess-chest-shuffle': 'off',
            }),
        );
        expect(statues.length - baseline.length).toBe(28);
        expect(
            cubes.filter((id) => logic.checks[id].type === 'goddess_cube'),
        ).toHaveLength(27);
        expect(
            cubes.filter((id) => logic.checks[id].type === 'goddess_chest'),
        ).toHaveLength(0);
        const state = stateWith({
            'bird-statues-give-items': 'on',
            'decouple-goddess-cubes-and-chests': 'on',
        });
        for (const id of apCountedCheckIdsSelector(state)) {
            if (['bird_statue', 'goddess_cube'].includes(logic.checks[id].type))
                expect(isCheckBannedSelector(state)(id)).toBe(false);
        }
    });

    it('does not use discovered statues or the default province entrance instead of an unlock item', () => {
        const settings = { 'bird-statues-need-unlock': 'on' };
        const inventory = { '\\Sky\\Faron Pillar_DAY': 1 };
        expect(
            reachable(
                inventory,
                settings,
            )('\\Faron\\Sealed Grounds Statue_DAY'),
        ).toBe(false);
        expect(
            reachable(
                { ...inventory, 'Sealed Grounds Statue Unlock': 1 },
                settings,
            )('\\Faron\\Sealed Grounds Statue_DAY'),
        ).toBe(true);
        expect(
            reachable(
                { ...inventory, 'Sealed Grounds Statue Unlock': 1 },
                settings,
            )('\\Faron\\Deep Woods Statue_DAY'),
        ).toBe(false);
        // Walking to a statue still lets the player fly back without owning its unlock.
        expect(
            reachable(
                {
                    '\\Faron\\Deep Woods Statue_DAY': 1,
                    Loftwing: 1,
                    Sailcloth: 1,
                },
                settings,
            )('\\Sky\\The Sky_DAY'),
        ).toBe(true);
    });

    it.each([
        {
            area: 'Inside the Volcano Statue',
            item: 'Inside the Volcano Statue Unlock',
            region: 'Eldin Volcano',
            location: 'Eldin Volcano - Inside the Volcano Bird Statue',
        },
        {
            area: 'Inside the Fire Sanctuary Statue',
            item: 'Inside the Fire Sanctuary Statue Unlock',
            region: 'Fire Sanctuary',
            location: 'Fire Sanctuary - Inside Fire Sanctuary Bird Statue',
        },
    ])(
        'requires the matching unlock to land at $area and maps its check to $region',
        ({ area, item, region, location }) => {
            const settings = { 'bird-statues-need-unlock': 'on' };
            const inventory = {
                '\\Sky\\Eldin Pillar_DAY': 1,
                [`\\Unlock ${area}`]: 1,
            };
            const destination = `\\Eldin\\${area}_DAY`;
            expect(reachable(inventory, settings)(destination)).toBe(false);
            expect(
                reachable({ ...inventory, [item]: 1 }, settings)(destination),
            ).toBe(true);
            expect(
                reachable(
                    { ...inventory, 'Temple Entrance Statue Unlock': 1 },
                    settings,
                )(destination),
            ).toBe(false);
            expect(
                reachable(inventory, { 'bird-statues-need-unlock': 'off' })(
                    destination,
                ),
            ).toBe(true);

            const received: Record<string, number> = {};
            applyApItemToTrackerInventory(received, item);
            expect(
                mergeApInventoryWithSeedItems({ [item]: 1 }, received)[item],
            ).toBe(1);
            const id = buildSshdApLocationResolver(logic)(location)!;
            expect(logic.checks[id].area).toBe(region);
            expect(reachable({ ...inventory, [item]: 1 }, settings)(id)).toBe(
                true,
            );
        },
    );

    it('preserves vanilla province access for old seeds without the new options', () => {
        expect(
            reachable({ '\\Sky\\Faron Pillar_DAY': 1 })(
                '\\Faron\\Sealed Grounds Statue_DAY',
            ),
        ).toBe(true);
        expect(
            apCountedCheckIdsSelector(stateWith()).some(
                (id) => logic.checks[id].type === 'bird_statue',
            ),
        ).toBe(false);
    });

    it('uses actual precollected and received statue items, not guessed starting statues', () => {
        const settings = optionIndicesToOptions(options, {
            option_bird_statues_need_unlock: 1,
            option_start_with_region_bird_statues: 1,
            option_custom_starting_items: {
                'Deep Woods Statue Unlock': 1,
            } as never,
        });
        const inventory = getInitialItems(settings);
        expect(inventory['Deep Woods Statue Unlock']).toBe(1);
        expect(inventory['Sealed Grounds Statue Unlock']).toBeUndefined();
        applyApItemToTrackerInventory(
            inventory,
            'Volcano Entrance Statue Unlock',
        );
        expect(inventory['Volcano Entrance Statue Unlock']).toBe(1);
    });

    it.each([0, 1, 2])(
        'loads AP chest mode %i and independent toggles automatically',
        (mode) => {
            const settings = optionIndicesToOptions(options, {
                option_goddess_chest_unlock: mode,
                option_decouple_goddess_cubes_and_chests: 1,
                option_bird_statues_give_items: 1,
                option_bird_statues_need_unlock: 0,
            });
            expect(settings['goddess-chest-unlock']).toBe(
                [
                    'locked_until_struck',
                    'unlocked_after_goddess_sword',
                    'unlocked_from_start',
                ][mode],
            );
            expect(settings['decouple-goddess-cubes-and-chests']).toBe('on');
            expect(settings['bird-statues-give-items']).toBe('on');
            expect(settings['bird-statues-need-unlock']).toBe('off');
        },
    );

    it('uses the cube only in locked-until-struck mode', () => {
        const chest =
            '\\Sky\\Lumpy Pumpkin Exterior\\Lumpy Pumpkin - Goddess Chest near Gossip Stone';
        const cube =
            '\\Faron\\Deep Woods\\Deep Woods - Goddess Cube Near Goron';
        const inventory = { '\\Sky\\Lumpy Pumpkin Exterior_DAY': 1 };
        expect(reachable(inventory)(chest)).toBe(false);
        expect(reachable({ ...inventory, [cube]: 1 })(chest)).toBe(true);
        // A server-confirmed cube remains activated even when the player can
        // no longer satisfy the requirements for reaching/striking it.
        expect(
            reachable(
                inventory,
                { 'decouple-goddess-cubes-and-chests': 'on' },
                [cube],
            )(chest),
        ).toBe(true);
        expect(
            reachable(inventory, {
                'goddess-chest-unlock': 'unlocked_from_start',
            })(chest),
        ).toBe(true);
        expect(
            reachable(
                { ...inventory, 'Progressive Sword': 1 },
                { 'goddess-chest-unlock': 'unlocked_after_goddess_sword' },
            )(chest),
        ).toBe(false);
        expect(
            reachable(
                { ...inventory, 'Progressive Sword': 2 },
                { 'goddess-chest-unlock': 'unlocked_after_goddess_sword' },
            )(chest),
        ).toBe(true);
    });

    it('gates a cube strike on Goddess Sword, independently of chest activation', () => {
        const cube =
            '\\Faron\\Deep Woods\\Deep Woods - Goddess Cube Near Goron';
        const inventory = { '\\Faron\\Deep Woods_DAY': 1 };
        const settings = {
            'goddess-chest-unlock': 'unlocked_from_start',
            'decouple-goddess-cubes-and-chests': 'on',
        };
        expect(
            reachable({ ...inventory, 'Progressive Sword': 1 }, settings)(cube),
        ).toBe(false);
        expect(
            reachable({ ...inventory, 'Progressive Sword': 2 }, settings)(cube),
        ).toBe(true);
    });

    it('does not remove physical chest obstacles when activation is automatic', () => {
        const chest =
            '\\Sky\\Triple Island\\Triple Island - Goddess Chest in Cage';
        const settings = { 'goddess-chest-unlock': 'unlocked_from_start' };
        const inventory = { '\\Sky\\Triple Island_DAY': 1 };
        expect(reachable(inventory, settings)(chest)).toBe(false);
        expect(reachable({ ...inventory, Clawshots: 1 }, settings)(chest)).toBe(
            true,
        );
    });

    it.each(
        [
            'locked_until_struck',
            'unlocked_after_goddess_sword',
            'unlocked_from_start',
        ].flatMap((mode) =>
            ['on', 'off'].map((unlocked) => ({ mode, unlocked })),
        ),
    )(
        'keeps optimized and unoptimized access equivalent ($mode, statue locks $unlocked)',
        ({ mode, unlocked }) => {
            const inventory = {
                Loftwing: 1,
                Sailcloth: 1,
                'Progressive Sword': 2,
                'Emerald Tablet': 1,
                'Ruby Tablet': 1,
                'Amber Tablet': 1,
                'Sealed Grounds Statue Unlock': 1,
                'Volcano East Statue Unlock': 1,
                'Lanayru Mine Entry Statue Unlock': 1,
            };
            const settings = {
                'bird-statues-need-unlock': unlocked,
                'goddess-chest-unlock': mode,
            };
            const baseline = reachableBits(inventory, settings);
            const optimized = reachableBits(inventory, settings, [], true);
            const differences = Object.keys(raw.checks).flatMap((id) => {
                const bit = logic.itemBits[id];
                if (bit === undefined) return [`${id}: unknown requirement`];
                const expected = baseline.test(bit);
                const actual = optimized.test(bit);
                return actual === expected
                    ? []
                    : [`${id}: expected ${expected}, got ${actual}`];
            });
            expect(differences).toEqual([]);
        },
    );

    it('does not double count precollected statue items received again from AP', () => {
        expect(
            mergeApInventoryWithSeedItems(
                { 'Deep Woods Statue Unlock': 1 },
                { 'Deep Woods Statue Unlock': 1 },
            )['Deep Woods Statue Unlock'],
        ).toBe(1);
    });
});
