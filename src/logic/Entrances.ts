import { invert } from 'es-toolkit';
import type { TypedOptions } from '../permalink/SettingsTypes';
import type { TrackerState } from '../tracker/Slice';
import { mapValues } from '../utils/Collections';
import { compareBy } from '../utils/Compare';
import { appError } from '../utils/Debug';
import { forceSshdManualEntranceTestMode } from './EntranceTestMode';
import type { DungeonName, ExitMapping } from './Locations';
import type {
    LinkedEntrancePool,
    Logic,
    TrackerLinkedEntrancePool,
} from './Logic';
import {
    bannedExitsAndEntrances,
    lmfSecondExit,
    nonRandomizedEntrances,
    nonRandomizedExits,
} from './ThingsThatWouldBeNiceToHaveInTheDump';
import type { RawEntranceConnection } from './UpstreamTypes';

export interface Entrance {
    name: string;
    id: string;
}

export function formatEntranceName(name: string): string {
    const separator = ' -> ';
    const separatorIndex = name.indexOf(separator);
    if (separatorIndex < 0) {
        return name;
    }

    const source = name.slice(0, separatorIndex);
    const destination = name.slice(separatorIndex + separator.length);
    return `${destination} (via ${source})`;
}

export interface EntrancePool {
    entrances: Entrance[];
    usedEntrancesExcluded: boolean;
}

export type ExitRule =
    | {
          /** This exit has its vanilla connection. */
          type: 'vanilla';
      }
    | {
          /** This exit always leads to the same entrance as `otherExit`. Currently used for Sandship. */
          type: 'follow';
          otherExit: string;
      }
    | {
          /** Return direction inferred from a coupled SSHD entrance. */
          type: 'coupledReverse';
          primaryExit: string;
      }
    | {
          /** This is LMF's second exit. It leads to its vanilla exit iff the LMF entrance is vanilla. */
          type: 'lmfSecondExit';
      }
    | {
          /** This exit exists only while another SSHD entrance is vanilla. */
          type: 'conditionalVanilla';
          controllerExit: string;
      }
    | {
          /** This is a linked exit, e.g. interior dungeon exit when exterior exit into dungeon has been mapped. */
          type: 'linked';
          pool: LinkedEntrancePool;
          /** The identifier of this pool entry ("Skyview", "Faron Silent Realm", ...) */
          entry: string;
      }
    | {
          /** This entrance is random in some way. */
          type: 'random';
          pool: string;
          isKnownIrrelevant?: boolean;
          /** Coupled SSHD entrances infer the opposite direction. */
          coupled?: boolean;
      };

const fullErPool = 'TR_FULL_ER';
const startingEntrancePool = 'TR_STARTING_ENTRANCE';

const sshdPoolPrefix = 'SSHD_ER_';

function isEnabled(value: unknown) {
    return value === true || value === 1 || value === 'on';
}

function sshdSettingEnabled(
    settings: TypedOptions,
    type: RawEntranceConnection['type'],
) {
    if (forceSshdManualEntranceTestMode) {
        return type !== 'Bird Statue';
    }
    switch (type) {
        case 'Dungeon':
            return isEnabled(settings['randomize-dungeon-entrances']);
        case 'Trial Gate':
            return isEnabled(settings['randomize-trial-gate-entrances']);
        case 'Door':
            return isEnabled(settings['randomize-door-entrances']);
        case 'Interior':
            return isEnabled(settings['randomize-interior-entrances']);
        case 'Overworld':
            return isEnabled(settings['randomize-overworld-entrances']);
        case 'Gate of Time':
            return isEnabled(settings['randomize-gate-of-time']);
        case 'Spawn':
            return (
                settings['random-starting-spawn'] !== undefined &&
                settings['random-starting-spawn'] !== 'vanilla'
            );
        case 'Faron Region Entrance':
        case 'Eldin Region Entrance':
        case 'Lanayru Region Entrance':
            return isEnabled(settings['random-starting-statues']);
        case 'Bird Statue':
            return false;
    }
}

function sshdPoolName(connection: RawEntranceConnection) {
    if (
        connection.type === 'Spawn' ||
        connection.type.endsWith('Region Entrance')
    ) {
        return `${sshdPoolPrefix}${connection.type}`;
    }
    if (connection.type === 'Overworld') {
        return `${sshdPoolPrefix}Overworld`;
    }
    return `${sshdPoolPrefix}${connection.type}${
        connection.primary ? '' : ' Reverse'
    }`;
}

function getCanonicalSshdConnections(
    areaGraph: Logic['areaGraph'],
    settings: TypedOptions,
) {
    const connections = Object.entries(areaGraph.entranceConnections);
    if (isEnabled(settings['decouple-double-doors'])) {
        return connections;
    }

    const canonicalDoors = new Set<string>();
    const result: typeof connections = [];
    for (const entry of connections) {
        const [exitId, connection] = entry;
        if (!connection.door_couple_tag) {
            result.push(entry);
            continue;
        }
        const key = `${connection.door_couple_tag}:${connection.primary}`;
        if (!canonicalDoors.has(key)) {
            canonicalDoors.add(key);
            result.push([exitId, connection]);
        }
    }
    return result;
}

function getSshdEntrancePools(
    areaGraph: Logic['areaGraph'],
    allowedStartingEntrances: Entrance[],
    settings: TypedOptions,
) {
    const decoupled = isEnabled(settings['decouple-entrances']);
    const result: Record<string, EntrancePool> = {};
    const connections = getCanonicalSshdConnections(areaGraph, settings);

    for (const [, connection] of connections) {
        if (!sshdSettingEnabled(settings, connection.type)) {
            continue;
        }
        if (
            !decoupled &&
            !connection.primary &&
            connection.type !== 'Overworld'
        ) {
            continue;
        }
        const pool = sshdPoolName(connection);
        result[pool] ??= { usedEntrancesExcluded: true, entrances: [] };
    }

    for (const [, connection] of connections) {
        const entranceDef = areaGraph.entrances[connection.entrance];
        if (!entranceDef) {
            continue;
        }
        if (connection.type === 'Bird Statue') {
            for (const province of ['Faron', 'Eldin', 'Lanayru']) {
                const pool = `${sshdPoolPrefix}${province} Region Entrance`;
                if (result[pool] && entranceDef.province?.includes(province)) {
                    result[pool].entrances.push({
                        id: connection.entrance,
                        name: entranceDef.short_name,
                    });
                }
            }
            continue;
        }
        if (connection.type.endsWith('Region Entrance')) {
            continue;
        }
        if (!sshdSettingEnabled(settings, connection.type)) {
            continue;
        }
        if (
            !decoupled &&
            !connection.primary &&
            connection.type !== 'Overworld'
        ) {
            continue;
        }
        const pool = sshdPoolName(connection);
        result[pool]?.entrances.push({
            id: connection.entrance,
            name: entranceDef.short_name,
        });
    }

    const spawnPool = `${sshdPoolPrefix}Spawn`;
    if (result[spawnPool]) {
        result[spawnPool] = {
            usedEntrancesExcluded: false,
            entrances: allowedStartingEntrances,
        };
    }
    return result;
}

export function getAllowedStartingEntrances(
    logic: Logic,
    randomizeStart: TypedOptions['random-start-entrance'],
    settings?: TypedOptions,
): Entrance[] {
    if (Object.keys(logic.areaGraph.entranceConnections).length && settings) {
        const mode = forceSshdManualEntranceTestMode
            ? 'anywhere'
            : settings['random-starting-spawn'];
        const allowedTypes =
            mode === 'bird_statues'
                ? new Set(['Bird Statue', 'Spawn'])
                : mode === 'any_surface_region'
                  ? new Set(['Door', 'Interior', 'Overworld', 'Spawn'])
                  : mode === 'anywhere'
                    ? new Set([
                          'Trial Gate',
                          'Door',
                          'Interior',
                          'Overworld',
                          'Bird Statue',
                          'Spawn',
                      ])
                    : new Set(['Spawn']);
        return Object.values(logic.areaGraph.entranceConnections)
            .filter(
                (connection) =>
                    allowedTypes.has(connection.type) &&
                    (mode !== 'any_surface_region' ||
                        !['Skyloft', 'Sky'].includes(
                            logic.areaGraph.entrances[connection.entrance]
                                ?.province ?? '',
                        )),
            )
            .map((connection) => connection.entrance)
            .filter(
                (entranceId, index, all) =>
                    all.indexOf(entranceId) === index &&
                    logic.areaGraph.entrances[entranceId]?.['can-start-at'] !==
                        false,
            )
            .map((id) => ({
                id,
                name: logic.areaGraph.entrances[id].short_name,
            }));
    }
    return Object.entries(logic.areaGraph.entrances)
        .filter(([id, def]) => {
            if (def['can-start-at'] === false) {
                return false;
            }

            // Vanilla starting entrance is always valid for all settings
            if (id === logic.areaGraph.vanillaConnections['\\Start']) {
                return true;
            }

            switch (randomizeStart) {
                case 'Vanilla':
                    return false;
                case 'Bird Statues':
                    return def.subtype === 'bird-statue-entrance';
                case 'Any Surface Region':
                    return def.province !== 'The Sky';
                case 'Any':
                    return true;
                default:
                    return true;
            }
        })
        .map(([id, def]) => ({
            id,
            name: def.short_name,
        }));
}

export function getEntrancePools(
    areaGraph: Logic['areaGraph'],
    allowedStartingEntrances: Entrance[],
    randomEntranceSetting: TypedOptions['randomize-entrances'],
    randomDungeonEntranceSetting: TypedOptions['randomize-dungeon-entrances'],
    requiredDungeons: DungeonName[],
    settings?: TypedOptions,
) {
    if (Object.keys(areaGraph.entranceConnections).length && settings) {
        return getSshdEntrancePools(
            areaGraph,
            allowedStartingEntrances,
            settings,
        );
    }
    const relevantDerSetting =
        randomDungeonEntranceSetting ?? randomEntranceSetting;
    const requiredDungeonsSeparately =
        relevantDerSetting === 'Required Dungeons Separately';
    const skyKeepVanilla =
        relevantDerSetting !== 'All Surface Dungeons + Sky Keep' &&
        relevantDerSetting !== 'Required Dungeons Separately';
    const requiredDungeons_: string[] = requiredDungeons;

    const result: Record<string, EntrancePool> = {};
    for (const [pool, entries] of Object.entries(
        areaGraph.linkedEntrancePools,
    )) {
        result[pool] = {
            usedEntrancesExcluded: true,
            entrances: [],
        };

        if (pool === 'dungeons' && requiredDungeonsSeparately) {
            result['dungeons_unrequired'] = {
                usedEntrancesExcluded: true,
                entrances: [],
            };
        }

        for (const [entry, linkage] of Object.entries(entries)) {
            if (skyKeepVanilla && entry === 'Sky Keep') {
                continue;
            }
            const entranceId = linkage.entrances[0];

            const val = {
                id: entranceId,
                name: areaGraph.entrances[entranceId].short_name,
            };

            if (
                requiredDungeonsSeparately &&
                pool === 'dungeons' &&
                !requiredDungeons_.includes(entry)
            ) {
                result['dungeons_unrequired'].entrances.push(val);
            } else {
                result[pool].entrances.push(val);
            }
        }
    }

    result[startingEntrancePool] = {
        usedEntrancesExcluded: false,
        entrances: allowedStartingEntrances,
    };

    for (const [pool, exitAndEntrances] of Object.entries(
        areaGraph.birdStatueSanity,
    )) {
        result[pool] = {
            usedEntrancesExcluded: false,
            entrances: Object.values(exitAndEntrances.entrances).map(
                (entranceId) => {
                    return {
                        id: entranceId,
                        name: areaGraph.entrances[entranceId].short_name,
                    };
                },
            ),
        };
    }

    result[fullErPool] = {
        usedEntrancesExcluded: false,
        entrances: Object.entries(areaGraph.entrances)
            .filter(
                ([entranceId]) =>
                    !bannedExitsAndEntrances.includes(entranceId) &&
                    areaGraph.entrances[entranceId].stage !== undefined &&
                    !nonRandomizedEntrances.includes(entranceId),
            )
            .map(([id, def]) => ({
                id,
                name: def.short_name,
            })),
    };

    return result;
}

export function getExitRules(
    logic: Logic,
    startingEntranceSetting: TypedOptions['random-start-entrance'],
    randomEntranceSetting: TypedOptions['randomize-entrances'],
    randomDungeonEntranceSetting: TypedOptions['randomize-dungeon-entrances'],
    randomTrialsSetting: TypedOptions['randomize-trials'],
    statueSanity: TypedOptions['random-start-statues'],
    eud: TypedOptions['empty-unrequired-dungeons'],
    requiredDungeons: DungeonName[],
    settings?: TypedOptions,
) {
    if (Object.keys(logic.areaGraph.entranceConnections).length && settings) {
        const result: Record<string, ExitRule> = {};
        const decoupled = isEnabled(settings['decouple-entrances']);
        const canonical = new Map(
            getCanonicalSshdConnections(logic.areaGraph, settings),
        );
        const canonicalDoorByGroup = new Map<string, string>();
        for (const [exitId, connection] of canonical) {
            if (connection.door_couple_tag) {
                canonicalDoorByGroup.set(
                    `${connection.door_couple_tag}:${connection.primary}`,
                    exitId,
                );
            }
        }

        for (const [exitId, connection] of Object.entries(
            logic.areaGraph.entranceConnections,
        )) {
            if (!sshdSettingEnabled(settings, connection.type)) {
                result[exitId] = { type: 'vanilla' };
                continue;
            }
            if (!canonical.has(exitId) && connection.door_couple_tag) {
                const key = `${connection.door_couple_tag}:${connection.primary}`;
                const canonicalExit = canonicalDoorByGroup.get(key);
                if (canonicalExit) {
                    result[exitId] = {
                        type: 'follow',
                        otherExit: canonicalExit,
                    };
                    continue;
                }
            }
            if (
                !decoupled &&
                !connection.primary &&
                connection.type !== 'Overworld' &&
                connection.reverse_exit
            ) {
                result[exitId] = {
                    type: 'coupledReverse',
                    primaryExit: connection.reverse_exit,
                };
                continue;
            }
            result[exitId] = {
                type: 'random',
                pool: sshdPoolName(connection),
                coupled: !decoupled && Boolean(connection.reverse_exit),
            };
        }

        for (const exitId of Object.keys(logic.areaGraph.exits)) {
            const controllerExit =
                logic.areaGraph.conditionalVanillaConnections[exitId];
            result[exitId] ??= controllerExit
                ? { type: 'conditionalVanilla', controllerExit }
                : { type: 'vanilla' };
        }
        return result;
    }
    const result: Record<string, ExitRule> = {};

    const followToCanonicalEntrance = invert<string, string>(
        logic.areaGraph.autoExits,
    );

    const everythingRandomized = randomEntranceSetting === 'All';
    const relevantDerSetting =
        randomDungeonEntranceSetting ?? randomEntranceSetting;
    const dungeonEntrancesRandomized = relevantDerSetting !== 'None';
    const requiredDungeonsSeparately =
        relevantDerSetting === 'Required Dungeons Separately';
    const skyKeepVanilla =
        relevantDerSetting !== 'All Surface Dungeons + Sky Keep' &&
        relevantDerSetting !== 'Required Dungeons Separately';

    for (const exitId of Object.keys(logic.areaGraph.exits)) {
        if (
            bannedExitsAndEntrances.includes(
                exitId,
            ) /*|| exitId.includes('Statue Dive')*/
        ) {
            continue;
        }

        if (nonRandomizedExits.includes(exitId)) {
            result[exitId] = { type: 'vanilla' };
            continue;
        }

        if (exitId === '\\Start') {
            if (startingEntranceSetting !== 'Vanilla') {
                result[exitId] = {
                    type: 'random',
                    pool: startingEntrancePool,
                };
            } else {
                result[exitId] = { type: 'vanilla' };
            }
            continue;
        }

        if (followToCanonicalEntrance[exitId]) {
            result[exitId] = {
                type: 'follow',
                otherExit: followToCanonicalEntrance[exitId],
            };
            continue;
        }

        if (exitId === lmfSecondExit) {
            result[exitId] = {
                type: 'lmfSecondExit',
            };
            continue;
        }

        const birdStatueSanityPool = Object.entries(
            logic.areaGraph.birdStatueSanity,
        ).find(([, entry]) => entry.exit === exitId);
        if (birdStatueSanityPool && statueSanity) {
            result[exitId] = {
                type: 'random',
                pool: birdStatueSanityPool[0],
            };
            continue;
        }

        const poolData = (() => {
            for (const [pool_, entries] of Object.entries(
                logic.areaGraph.linkedEntrancePools,
            )) {
                const pool =
                    pool_ as keyof typeof logic.areaGraph.linkedEntrancePools;
                for (const [entry, linkage] of Object.entries(entries)) {
                    if (linkage.exits[0] === exitId) {
                        return [pool, entry, true] as const;
                    } else if (linkage.exits[1] === exitId) {
                        return [pool, entry, false] as const;
                    }
                }
            }
        })();

        if (poolData) {
            const [pool, entry, isOutsideExit] = poolData;
            if (
                (pool === 'dungeons' &&
                    dungeonEntrancesRandomized &&
                    (entry !== 'Sky Keep' || !skyKeepVanilla)) ||
                (pool === 'silent_realms' && randomTrialsSetting)
            ) {
                if (isOutsideExit) {
                    const requiredDungeons_: string[] = requiredDungeons;
                    if (
                        pool === 'dungeons' &&
                        requiredDungeonsSeparately &&
                        !requiredDungeons_.includes(entry)
                    ) {
                        result[exitId] = {
                            type: 'random',
                            pool: 'dungeons_unrequired' satisfies TrackerLinkedEntrancePool,
                            isKnownIrrelevant: eud,
                        };
                    } else {
                        result[exitId] = { type: 'random', pool };
                    }
                } else {
                    result[exitId] = { type: 'linked', pool, entry };
                }
            } else {
                result[exitId] = { type: 'vanilla' };
            }
            continue;
        }

        if (everythingRandomized) {
            const exitDef = logic.areaGraph.exits[exitId];
            if (
                exitDef.stage === undefined ||
                exitDef.vanilla === undefined ||
                exitId.includes('Pillar')
            ) {
                result[exitId] = { type: 'vanilla' };
            } else {
                result[exitId] = { type: 'random', pool: fullErPool };
            }
            continue;
        }

        result[exitId] = { type: 'vanilla' };
    }

    return result;
}

export function getExits(
    logic: Logic,
    exitRules: Record<string, ExitRule>,
    mappedExits: TrackerState['mappedExits'],
) {
    const result: { [exitId: string]: ExitMapping } = {};
    const rules = Object.entries(exitRules);

    const makeEntrance = (
        entranceId: string | undefined,
    ): ExitMapping['entrance'] => {
        if (!entranceId) {
            return undefined;
        }
        const rawEntrance = logic.areaGraph.entrances[entranceId];
        if (rawEntrance) {
            return {
                id: entranceId,
                name: rawEntrance.short_name,
                region: logic.areaGraph.entranceHintRegions[entranceId],
            };
        } else {
            appError('unknown entrance', entranceId);
        }
    };

    const makeExit = (id: string): ExitMapping['exit'] => ({
        id,
        name: logic.areaGraph.exits[id].short_name,
    });

    // Exit assignment has to happen in this order because there are dependencies
    const assignmentOrder: ExitRule['type'][] = [
        'vanilla',
        'random',
        // these depend on dungeon entrances
        'coupledReverse',
        'follow',
        'linked',
        'lmfSecondExit',
        'conditionalVanilla',
    ];

    rules.sort(compareBy(([_, rule]) => assignmentOrder.indexOf(rule.type)));
    for (const [exitId, rule] of rules) {
        switch (rule.type) {
            case 'vanilla':
                result[exitId] = {
                    canAssign: false,
                    entrance: makeEntrance(
                        logic.areaGraph.vanillaConnections[exitId],
                    ),
                    exit: makeExit(exitId),
                    rule,
                };
                break;
            case 'random':
                result[exitId] = {
                    canAssign: true,
                    entrance: makeEntrance(mappedExits[exitId]),
                    exit: makeExit(exitId),
                    rule,
                };
                break;
            case 'follow':
                result[exitId] = {
                    canAssign: false,
                    entrance: result[rule.otherExit].entrance,
                    exit: makeExit(exitId),
                    rule,
                };
                break;
            case 'linked': {
                // This is unfortunately somewhat complex. This might be an exit like "ET - Main Exit",
                // and if the Deep Woods - Exit to SV leads to ET - Main Entrance, then we know this
                // exit leads to Deep Woods - Entrance from SV.
                const location = rule.entry;
                const pool = logic.areaGraph.linkedEntrancePools[rule.pool];
                // This is the corresponding entrance for this exit
                const neededEntrance = pool[location].entrances[0];
                // Find the exit that was mapped to an entrance in this location
                const sourceLocation = Object.entries(pool).find(
                    ([, linkage]) =>
                        result[linkage.exits[0]].entrance?.id ===
                        neededEntrance,
                )?.[0];

                if (!sourceLocation) {
                    result[exitId] = {
                        canAssign: false,
                        entrance: undefined,
                        exit: makeExit(exitId),
                        rule,
                    };
                } else {
                    const reverseEntrance = pool[sourceLocation].entrances[1];
                    result[exitId] = {
                        canAssign: false,
                        entrance: makeEntrance(reverseEntrance),
                        exit: makeExit(exitId),
                        rule,
                    };
                }
                break;
            }
            case 'lmfSecondExit': {
                // LMF's second exit leads to ToT (vanilla) if LMF is at LMF, otherwise it's neutered
                const lmfPool =
                    logic.areaGraph.linkedEntrancePools.dungeons[
                        'Lanayru Mining Facility'
                    ];
                if (
                    result[lmfPool.exits[0]].entrance?.id ===
                    lmfPool.entrances[0]
                ) {
                    // LMF is vanilla
                    result[exitId] = {
                        canAssign: false,
                        entrance: makeEntrance(
                            logic.areaGraph.vanillaConnections[exitId],
                        ),
                        exit: makeExit(exitId),
                        rule,
                    };
                } else {
                    result[exitId] = {
                        canAssign: false,
                        entrance: undefined,
                        exit: makeExit(exitId),
                        rule,
                    };
                }
                break;
            }
            case 'coupledReverse':
            case 'conditionalVanilla':
                result[exitId] = {
                    canAssign: false,
                    entrance: undefined,
                    exit: makeExit(exitId),
                    rule,
                };
                break;
        }
    }

    if (Object.keys(logic.areaGraph.entranceConnections).length) {
        const connectionByEntrance = new Map(
            Object.entries(logic.areaGraph.entranceConnections).map(
                ([exitId, connection]) => [
                    connection.entrance,
                    { exitId, connection },
                ],
            ),
        );
        for (const [sourceExit, targetEntrance] of Object.entries(
            mappedExits,
        )) {
            if (!targetEntrance) {
                continue;
            }
            const sourceRule = exitRules[sourceExit];
            const sourceConnection =
                logic.areaGraph.entranceConnections[sourceExit];
            const targetConnection =
                connectionByEntrance.get(targetEntrance)?.connection;
            if (
                sourceRule?.type !== 'random' ||
                !sourceRule.coupled ||
                !sourceConnection?.reverse_entrance ||
                !targetConnection?.reverse_exit
            ) {
                continue;
            }
            const inferredExit = targetConnection.reverse_exit;
            if (mappedExits[inferredExit] || !result[inferredExit]) {
                continue;
            }
            result[inferredExit] = {
                ...result[inferredExit],
                entrance: makeEntrance(sourceConnection.reverse_entrance),
            };
        }
    }

    // A followed double-door direction can depend on a coupled return that was
    // inferred above, so refresh it after all coupled assignments are known.
    for (const [exitId, rule] of rules) {
        if (rule.type === 'follow') {
            result[exitId] = {
                ...result[exitId],
                entrance: result[rule.otherExit]?.entrance,
            };
        }
    }

    for (const [exitId, rule] of rules) {
        if (rule.type !== 'conditionalVanilla') {
            continue;
        }
        const controllerIsVanilla =
            result[rule.controllerExit]?.entrance?.id ===
            logic.areaGraph.vanillaConnections[rule.controllerExit];
        result[exitId] = {
            ...result[exitId],
            entrance: controllerIsVanilla
                ? makeEntrance(logic.areaGraph.vanillaConnections[exitId])
                : undefined,
        };
    }
    return Object.values(result).sort(compareBy((exit) => !exit.canAssign));
}

export function getUsedEntrances(
    entrancePools: Record<string, EntrancePool>,
    exits: ExitMapping[],
) {
    const result = mapValues(entrancePools, (): string[] => []);

    for (const exit of exits) {
        if (exit.canAssign && exit.entrance) {
            result[exit.rule.pool]?.push(exit.entrance.id);
        }
    }

    return result;
}
