import yaml from 'js-yaml';
import fs from 'node:fs';
import { lightColorScheme } from '../src/customization/ColorScheme';
import { LOCAL_SSHD_STRING } from '../src/loader/LogicLoader';
import { getExitRules, getExits } from '../src/logic/Entrances';
import { parseLogic } from '../src/logic/Logic';
import { getInitialItems } from '../src/logic/TrackerModifications';
import type { RawLogic } from '../src/logic/UpstreamTypes';
import { validateSettings } from '../src/permalink/Settings';
import type { OptionDefs } from '../src/permalink/SettingsTypes';
import type { RootState } from '../src/store/Store';
import {
    areasSelector,
    inLogicBitsSelector,
    totalCountersSelector,
} from '../src/tracker/Selectors';

const dumpPath = process.argv[2] ?? 'testData/sshd-dump.yaml';
const optionsPath = process.argv[3] ?? 'testData/sshd-options.yaml';
const dump = yaml.load(fs.readFileSync(dumpPath, 'utf8')) as RawLogic;
const options = yaml.load(fs.readFileSync(optionsPath, 'utf8')) as OptionDefs;
const logic = parseLogic(dump);
const settings = validateSettings(options, {});
const state: RootState = {
    customization: {
        colorScheme: lightColorScheme,
        itemLayout: 'inventory',
        locationLayout: 'map',
        trickSemilogic: false,
        enabledTrickLogicTricks: [],
        counterBasis: 'logic',
        tumbleweed: false,
        customLayout: undefined,
        itemLocationAssignment: false,
        autoRegionLoading: false,
    },
    tracker: {
        checkedChecks: [],
        inventory: getInitialItems(settings),
        hasBeenModified: false,
        mappedExits: {},
        requiredDungeons: [],
        hints: {},
        checkHints: {},
        settings,
        userHintsText: '',
        lastCheckedLocation: undefined,
    },
    logic: {
        loaded: {
            logic: dump,
            options,
            presets: {},
            remote: { type: 'localSshd' },
            remoteName: LOCAL_SSHD_STRING,
        },
    },
    saves: { presets: [] },
};
const counters = totalCountersSelector(state);
const inLogicBits = inLogicBitsSelector(state);
const areas = areasSelector(state);
const inLogicChecks = Object.entries(logic.checks)
    .filter(([checkId]) => inLogicBits.test(logic.itemBits[checkId]))
    .slice(0, 20)
    .map(([checkId, check]) => ({ checkId, name: check.name }));
const exitRules = getExitRules(
    logic,
    settings['random-start-entrance'],
    settings['randomize-entrances'],
    settings['randomize-dungeon-entrances'],
    settings['randomize-trials'],
    settings['random-start-statues'],
    settings['empty-unrequired-dungeons'],
    [],
    settings,
);
const exits = getExits(logic, exitRules, {});
const startExit = exits.find((exit) => exit.exit.id === '\\Start');

console.log(
    JSON.stringify(
        {
            checks: Object.keys(logic.checks).length,
            hintRegions: logic.hintRegions.length,
            requirements: logic.numRequirements,
            start: {
                setting: settings['random-start-entrance'],
                rule: exitRules['\\Start'],
                vanilla: logic.areaGraph.vanillaConnections['\\Start'],
                mapped: startExit?.entrance?.id,
                entranceTime:
                    startExit?.entrance &&
                    logic.areaGraph.entrances[startExit.entrance.id]
                        .allowed_time_of_day,
                spawnArea:
                    startExit?.entrance &&
                    logic.areaGraph.areasByEntrance[startExit.entrance.id]?.id,
                startBit: inLogicBits.test(logic.itemBits['\\Start']),
                entranceBit:
                    startExit?.entrance &&
                    inLogicBits.test(logic.itemBits[startExit.entrance.id]),
                entranceDayBit:
                    startExit?.entrance &&
                    inLogicBits.test(
                        logic.itemBits[`${startExit.entrance.id}_DAY`],
                    ),
                entranceNightBit:
                    startExit?.entrance &&
                    inLogicBits.test(
                        logic.itemBits[`${startExit.entrance.id}_NIGHT`],
                    ),
                spawnAreaDayBit:
                    startExit?.entrance &&
                    inLogicBits.test(
                        logic.itemBits[
                            `${logic.areaGraph.areasByEntrance[startExit.entrance.id]?.id}_DAY`
                        ],
                    ),
                spawnAreaNightBit:
                    startExit?.entrance &&
                    inLogicBits.test(
                        logic.itemBits[
                            `${logic.areaGraph.areasByEntrance[startExit.entrance.id]?.id}_NIGHT`
                        ],
                    ),
            },
            firstAccessibleAreas: areas
                .filter((area) => area.checks.numAccessible > 0)
                .slice(0, 5)
                .map((area) => ({
                    area: area.name,
                    accessible: area.checks.numAccessible,
                })),
            firstInLogicChecks: inLogicChecks,
            counters,
        },
        null,
        2,
    ),
);
