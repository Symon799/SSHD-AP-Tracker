import { load } from 'js-yaml';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../permalink/Settings';
import type { OptionDefs } from '../permalink/SettingsTypes';
import { computeLeastFixedPoint, mergeRequirements } from './bitlogic/BitLogic';
import type { LogicalExpression } from './bitlogic/LogicalExpression';
import {
    getAllowedStartingEntrances,
    getEntrancePools,
    getExitRules,
    getExits,
} from './Entrances';
import { defaultRequiredDungeons } from './Locations';
import { parseLogic } from './Logic';
import { mapInventory, mapSettings } from './Mappers';
import { exploreAreaGraph } from './Pathfinding';
import type { RawLogic } from './UpstreamTypes';

function formatExpr(
    logic: ReturnType<typeof parseLogic>,
    expr: LogicalExpression | undefined,
) {
    if (!expr || expr.isTriviallyFalse()) {
        return 'false';
    }
    if (expr.isTriviallyTrue()) {
        return 'true';
    }
    return expr.conjunctions
        .map((conj) =>
            [...conj.iter()]
                .map((bit) => logic.allItems[bit] ?? `<unknown:${bit}>`)
                .join(' & '),
        )
        .join(' | ');
}

describe('SSHD generated dump', () => {
    it('parses with the tracker logic engine', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const logic = parseLogic(raw);

        expect(Object.keys(raw.checks)).toHaveLength(893);
        expect(
            logic.checks[
                "\\Skyloft\\Knight Academy\\Knight Academy - Fledge's Gift"
            ],
        ).toMatchObject({
            name: "Knight Academy - Fledge's Gift",
            area: 'Upper Skyloft',
        });
        expect(
            logic.checks[
                "\\Skyloft\\Knight Academy\\Knight Academy - Groose's Closet"
            ],
        ).toMatchObject({
            name: "Knight Academy - Groose's Closet",
            area: 'Upper Skyloft',
        });
        expect(
            logic.checks[
                "\\Skyloft\\Knight Academy\\Knight Academy - Owlan's Closet"
            ],
        ).toMatchObject({
            name: "Knight Academy - Owlan's Closet",
            area: 'Upper Skyloft',
        });
        expect(
            Object.keys(logic.areaGraph.entranceConnections).length,
        ).toBeGreaterThan(180);
    });

    it('keeps SSHD dungeon entrances vanilla when dungeon ER is off', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const options = load(
            fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
        ) as OptionDefs;
        const logic = parseLogic(raw);
        const settings = defaultSettings(options);
        const rules = getExitRules(
            logic,
            settings['random-start-entrance'],
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            settings['randomize-trials'],
            settings['random-start-statues'],
            settings['empty-unrequired-dungeons'],
            defaultRequiredDungeons(),
            settings,
        );
        const skyviewExit = '\\Faron\\Deep Woods\\Exit to Skyview Entry';
        expect(rules[skyviewExit]).toEqual({ type: 'vanilla' });
        expect(
            getExits(logic, rules, {}).find(
                (exit) => exit.exit.id === skyviewExit,
            )?.entrance?.id,
        ).toBe('\\Skyview\\Skyview Entry\\Entrance from Deep Woods');
    });

    it('maps coupled SSHD dungeons and infers their return entrance', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const options = load(
            fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
        ) as OptionDefs;
        const logic = parseLogic(raw);
        const settings = defaultSettings(options);
        settings['randomize-dungeon-entrances'] = 'on' as never;
        settings['decouple-entrances'] = 'off';
        const pools = getEntrancePools(
            logic.areaGraph,
            getAllowedStartingEntrances(
                logic,
                settings['random-start-entrance'],
                settings,
            ),
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            defaultRequiredDungeons(),
            settings,
        );
        expect(pools.SSHD_ER_Dungeon.entrances).toHaveLength(7);
        expect(pools['SSHD_ER_Dungeon Reverse']).toBeUndefined();

        const rules = getExitRules(
            logic,
            settings['random-start-entrance'],
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            settings['randomize-trials'],
            settings['random-start-statues'],
            settings['empty-unrequired-dungeons'],
            defaultRequiredDungeons(),
            settings,
        );
        const sourceExit = '\\Faron\\Deep Woods\\Exit to Skyview Entry';
        const earthEntrance =
            '\\Earth Temple\\Earth Temple First Room\\Entrance from Near Temple Entrance';
        const exits = getExits(logic, rules, {
            [sourceExit]: earthEntrance,
        });
        const inferredReturn = exits.find(
            (exit) =>
                exit.exit.id ===
                '\\Earth Temple\\Earth Temple First Room\\Exit to Near Temple Entrance',
        );
        expect(inferredReturn?.entrance?.id).toBe(
            '\\Faron\\Deep Woods\\Entrance from Skyview Entry',
        );
        expect(inferredReturn?.canAssign).toBe(false);
    });

    it('keeps both SSHD entrance directions independent when decoupled', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const options = load(
            fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
        ) as OptionDefs;
        const logic = parseLogic(raw);
        const settings = defaultSettings(options);
        settings['randomize-dungeon-entrances'] = 'on' as never;
        settings['decouple-entrances'] = 'on';
        const rules = getExitRules(
            logic,
            settings['random-start-entrance'],
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            settings['randomize-trials'],
            settings['random-start-statues'],
            settings['empty-unrequired-dungeons'],
            defaultRequiredDungeons(),
            settings,
        );
        const exits = getExits(logic, rules, {
            '\\Faron\\Deep Woods\\Exit to Skyview Entry':
                '\\Earth Temple\\Earth Temple First Room\\Entrance from Near Temple Entrance',
        });
        expect(
            exits.find(
                (exit) =>
                    exit.exit.id ===
                    '\\Earth Temple\\Earth Temple First Room\\Exit to Near Temple Entrance',
            )?.entrance,
        ).toBeUndefined();
    });

    it('keeps the LMF-to-Temple-of-Time passage only for vanilla LMF', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const options = load(
            fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
        ) as OptionDefs;
        const logic = parseLogic(raw);
        const settings = defaultSettings(options);
        settings['randomize-dungeon-entrances'] = 'on' as never;
        settings['decouple-entrances'] = 'off';
        const rules = getExitRules(
            logic,
            settings['random-start-entrance'],
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            settings['randomize-trials'],
            settings['random-start-statues'],
            settings['empty-unrequired-dungeons'],
            defaultRequiredDungeons(),
            settings,
        );
        const lmfEntranceExit = '\\Lanayru\\Top of LMF\\Exit to LMF First Room';
        const lmfVanillaEntrance =
            '\\Lanayru Mining Facility\\LMF First Room\\Entrance from Top of LMF';
        const conditionalExit =
            '\\Lanayru Mining Facility\\LMF End of Hall of Ancient Robots\\Exit to Temple of Time West Post LMF Area';

        const vanillaLmf = getExits(logic, rules, {
            [lmfEntranceExit]: lmfVanillaEntrance,
        });
        expect(
            vanillaLmf.find((exit) => exit.exit.id === conditionalExit)
                ?.entrance?.id,
        ).toBe(
            '\\Lanayru\\Temple of Time West Post LMF Area\\Entrance from LMF End of Hall of Ancient Robots',
        );

        const movedLmf = getExits(logic, rules, {
            [lmfEntranceExit]:
                '\\Skyview\\Skyview Entry\\Entrance from Deep Woods',
        });
        expect(
            movedLmf.find((exit) => exit.exit.id === conditionalExit)?.entrance,
        ).toBeUndefined();
    });

    it('builds manual pools for every supported SSHD entrance category', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const options = load(
            fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
        ) as OptionDefs;
        const logic = parseLogic(raw);
        const settings = defaultSettings(options);
        for (const command of [
            'randomize-dungeon-entrances',
            'randomize-trial-gate-entrances',
            'randomize-door-entrances',
            'randomize-interior-entrances',
            'randomize-overworld-entrances',
            'randomize-gate-of-time',
            'random-starting-statues',
        ]) {
            settings[command] = 'on';
        }
        settings['random-starting-spawn'] = 'anywhere';

        const pools = getEntrancePools(
            logic.areaGraph,
            getAllowedStartingEntrances(
                logic,
                settings['random-start-entrance'],
                settings,
            ),
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            defaultRequiredDungeons(),
            settings,
        );
        for (const pool of [
            'SSHD_ER_Dungeon',
            'SSHD_ER_Trial Gate',
            'SSHD_ER_Door',
            'SSHD_ER_Interior',
            'SSHD_ER_Overworld',
            'SSHD_ER_Gate of Time',
            'SSHD_ER_Spawn',
            'SSHD_ER_Faron Region Entrance',
            'SSHD_ER_Eldin Region Entrance',
            'SSHD_ER_Lanayru Region Entrance',
        ]) {
            expect(pools[pool]?.entrances.length, pool).toBeGreaterThan(0);
        }
        for (const [poolName, pool] of Object.entries(pools)) {
            expect(
                new Set(pool.entrances.map((entrance) => entrance.name)).size,
                `${poolName} has duplicate labels`,
            ).toBe(pool.entrances.length);
        }
    });

    it('keeps coupled double-door markers tied to one manual choice', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const options = load(
            fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
        ) as OptionDefs;
        const logic = parseLogic(raw);
        const settings = defaultSettings(options);
        settings['randomize-door-entrances'] = 'on';
        settings['decouple-double-doors'] = 'off';
        const rules = getExitRules(
            logic,
            settings['random-start-entrance'],
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            settings['randomize-trials'],
            settings['random-start-statues'],
            settings['empty-unrequired-dungeons'],
            defaultRequiredDungeons(),
            settings,
        );
        const groupedDoors = Object.entries(
            logic.areaGraph.entranceConnections,
        ).filter(([, connection]) => connection.door_couple_tag);

        expect(groupedDoors.length).toBeGreaterThan(0);
        expect(
            groupedDoors.some(([exitId]) => rules[exitId].type === 'follow'),
        ).toBe(true);
    });

    it('preserves key Skyloft helper requirements through simplification', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const logic = parseLogic(raw);

        const inspect = (
            name: string,
        ): { bit: number; raw: string; simplified: string } => {
            const bit = logic.itemBits[name];
            if (bit === undefined) {
                throw new Error(`Missing bit for ${name}`);
            }
            return {
                bit,
                raw: formatExpr(logic, logic.rawStaticRequirements[bit]),
                simplified: formatExpr(logic, logic.staticRequirements[bit]),
            };
        };

        const ancientFlowerFarming = inspect('\\Ancient Flower Farming');
        expect(ancientFlowerFarming.bit).toBe(
            logic.itemBits['\\Ancient Flower Farming'],
        );
        expect(typeof ancientFlowerFarming.raw).toBe('string');
        expect(typeof ancientFlowerFarming.simplified).toBe('string');

        expect(inspect('\\Talk to Orielle').simplified).not.toBe('false');
        expect(inspect('\\Pouch').simplified).not.toBe('false');
        expect(inspect('\\Can Afford 300 Rupees').simplified).not.toBe('false');
        expect(inspect('\\Skyloft\\Bazaar').simplified).not.toBe('false');

        expect(
            inspect(
                "\\Skyloft\\Beedle's Airshop\\Beedle's Airshop - 300 Rupee Item",
            ).simplified,
        ).not.toBe('false');
        expect(
            inspect(
                "\\Skyloft\\Central Skyloft\\Central Skyloft - Parrow's Gift",
            ).simplified,
        ).not.toBe('false');
        expect(
            inspect(
                "\\Skyloft\\Peatrice's House\\Central Skyloft - Peatrice's Love",
            ).simplified,
        ).not.toBe('false');
    });

    it('preserves key SSHD progression bits used by UT parity checks', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const logic = parseLogic(raw);

        const inspect = (name: string) => {
            const bit = logic.itemBits[name];
            if (bit === undefined) {
                throw new Error(`Missing bit for ${name}`);
            }
            return {
                raw: formatExpr(logic, logic.rawStaticRequirements[bit]),
                simplified: formatExpr(logic, logic.staticRequirements[bit]),
            };
        };

        const suspects = [
            "\\Faron\\Farore's Silent Realm",
            "\\Skyloft\\The Goddess's Silent Realm",
            '\\Pumpkin Carrying',
            '\\Complete Hot Soup Delivery',
            '\\Delivered Hot Soup',
            "\\Goddess's Harp",
            "Farore's Courage",
            'Deep Woods Goddess Cube near Goron',
            'Deep Woods Goddess Cube in front of Temple',
        ];
        for (const suspect of suspects) {
            expect(inspect(suspect).raw).toBeTypeOf('string');
            expect(inspect(suspect).simplified).toBeTypeOf('string');
        }

        expect(inspect("\\Faron\\Farore's Silent Realm").simplified).not.toBe(
            'false',
        );
        expect(
            inspect("\\Skyloft\\The Goddess's Silent Realm").simplified,
        ).not.toBe('false');
        expect(inspect('\\Pumpkin Carrying').simplified).not.toBe('false');
        expect(inspect('\\Complete Hot Soup Delivery').simplified).not.toBe(
            'false',
        );
        expect(inspect('\\Delivered Hot Soup').simplified).not.toBe('false');
        expect(inspect("\\Goddess's Harp").simplified).not.toBe('false');
        expect(inspect('\\Full Song of the Hero').simplified).not.toBe('false');
        expect(
            inspect('Deep Woods Goddess Cube near Goron').simplified,
        ).not.toBe('false');
        expect(
            inspect('Deep Woods Goddess Cube in front of Temple').simplified,
        ).not.toBe('false');
    });

    it('requires Loftwing for sky islands and keeps Sailcloth separate', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const logic = parseLogic(raw);

        const beedlesIsland = formatExpr(
            logic,
            logic.rawStaticRequirements[
                logic.itemBits["\\Sky\\Beedle's Island_DAY"]
            ],
        );
        const faronPillar = formatExpr(
            logic,
            logic.rawStaticRequirements[
                logic.itemBits['\\Sky\\Faron Pillar_DAY']
            ],
        );

        expect(beedlesIsland).toContain('Loftwing');
        expect(faronPillar).toContain('Loftwing');
        expect(faronPillar).toContain('Sailcloth');

        const beedlesIslandArea =
            raw.areas.sub_areas.Sky.sub_areas["Beedle's Island"];
        expect(beedlesIslandArea.exits?.['\\Sky\\The Sky']).toContain(
            'Loftwing',
        );
    });

    it('opens Goddess Silent Realm when harp, sword, and full song are owned', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const logic = parseLogic(raw);
        const options = load(
            fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
        ) as OptionDefs;
        const settings = defaultSettings(options);
        const exitRules = getExitRules(
            logic,
            settings['random-start-entrance'],
            settings['randomize-entrances'],
            settings['randomize-dungeon-entrances'],
            settings['randomize-trials'],
            settings['random-start-statues'],
            settings['empty-unrequired-dungeons'],
            defaultRequiredDungeons(),
            settings,
        );
        const exits = getExits(logic, exitRules, {});
        const inventoryRequirements = mapInventory(logic, {
            "Goddess's Harp": 1,
            'Progressive Sword': 1,
            'Song of the Hero': 4,
            '\\Skyloft\\Upper Skyloft_NIGHT': 1,
        });
        const bits = mergeRequirements(
            logic.numRequirements,
            logic.staticRequirements,
            inventoryRequirements,
            mapSettings(
                logic,
                options,
                settings,
                exits,
                defaultRequiredDungeons(),
            ),
        );
        const reachable = computeLeastFixedPoint('test', bits);

        const fullSongBit = logic.itemBits['\\Full Song of the Hero'];
        expect(reachable.test(fullSongBit)).toBe(true);
        const reward =
            "\\Skyloft\\The Goddess's Silent Realm\\The Goddess's Silent Realm - Collect all Tears Reward";
        expect(
            exploreAreaGraph(logic.areaGraph, exits, reachable)?.[reward],
        ).toBeTruthy();

        const withoutSong = mapInventory(logic, {
            "Goddess's Harp": 1,
            'Progressive Sword': 1,
            'Song of the Hero': 3,
            '\\Skyloft\\Upper Skyloft_NIGHT': 1,
        });
        const unreachable = computeLeastFixedPoint(
            'test',
            mergeRequirements(
                logic.numRequirements,
                logic.staticRequirements,
                withoutSong,
                mapSettings(
                    logic,
                    options,
                    settings,
                    exits,
                    defaultRequiredDungeons(),
                ),
            ),
        );
        expect(unreachable.test(fullSongBit)).toBe(false);
        expect(
            exploreAreaGraph(logic.areaGraph, exits, unreachable)?.[reward],
        ).toBeUndefined();
    });
});
