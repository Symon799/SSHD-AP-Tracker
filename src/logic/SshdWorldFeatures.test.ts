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
import { reset } from '../tracker/Slice';
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

function reachable(
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
    const bits = computeLeastFixedPoint(
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

describe('SSHD bird statues and goddess chest options', () => {
    it('maps every statue check to an existing region and inventory item', () => {
        const resolve = buildSshdApLocationResolver(logic);
        const regions = areasSelector(
            stateWith({ 'bird-statues-give-items': 'on' }),
        );
        expect(birdStatueItems).toHaveLength(26);
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
        expect(statues.length - baseline.length).toBe(26);
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

    it('keeps optimized and unoptimized access equivalent with real inventory', () => {
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
        for (const mode of [
            'locked_until_struck',
            'unlocked_after_goddess_sword',
            'unlocked_from_start',
        ]) {
            for (const unlocked of ['on', 'off']) {
                const settings = {
                    'bird-statues-need-unlock': unlocked,
                    'goddess-chest-unlock': mode,
                };
                const baseline = reachable(inventory, settings);
                const optimized = reachable(inventory, settings, [], true);
                for (const id of Object.keys(raw.checks))
                    expect(optimized(id), id).toBe(baseline(id));
            }
        }
    });

    it('does not double count precollected statue items received again from AP', () => {
        expect(
            mergeApInventoryWithSeedItems(
                { 'Deep Woods Statue Unlock': 1 },
                { 'Deep Woods Statue Unlock': 1 },
            )['Deep Woods Statue Unlock'],
        ).toBe(1);
    });
});
