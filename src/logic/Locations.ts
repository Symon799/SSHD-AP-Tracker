import type { ExitRule } from './Entrances';
import type { LogicalCheck } from './Logic';

export interface CheckGroup {
    /**
     * A flat list of all checks in this group. May include some
     * non-progress checks, e.g. banned gratitude crystals.
     */
    list: string[];
    /** The number of progress checks, excluding banned crystals. */
    numTotal: number;
    /**
     * The number of uncollected progress checks that are currently
     * considered in logic.
     */
    numAccessible: number;
    /** The number of uncollected progress checks. */
    numRemaining: number;
}

export interface HintRegion<N extends string = string> {
    name: N;
    nonProgress: boolean;
    hidden: boolean;

    checks: CheckGroup;
    extraLocations: {
        tr_cube?: CheckGroup;
        loose_crystal?: CheckGroup;
        gossip_stone?: CheckGroup;
        exits?: CheckGroup;
    };
}

export type LogicalState = 'outLogic' | 'inLogic' | 'semiLogic' | 'trickLogic';

export interface Check {
    type: LogicalCheck['type'] | 'exit';
    checkId: string;
    checkName: string;
    logicalState: LogicalState;
    checked: boolean;
}

interface AbstractExitMapping {
    exit: {
        id: string;
        name: string;
    };
    entrance:
        | {
              id: string;
              name: string;
              region: string;
          }
        | undefined;
    canAssign: boolean;
    rule: ExitRule;
}

export interface ReadOnlyExitMapping extends AbstractExitMapping {
    canAssign: false;
    rule: ExitRule & {
        type:
            | 'vanilla'
            | 'follow'
            | 'coupledReverse'
            | 'lmfSecondExit'
            | 'conditionalVanilla'
            | 'linked';
    };
}

export interface AssignableExitMapping extends AbstractExitMapping {
    canAssign: true;
    rule: ExitRule & { type: 'random' };
}

export type ExitMapping = ReadOnlyExitMapping | AssignableExitMapping;

export const dungeonNames = [
    'Skyview',
    'Earth Temple',
    'Lanayru Mining Facility',
    'Ancient Cistern',
    'Sandship',
    'Fire Sanctuary',
    'Sky Keep',
] as const;

export type DungeonName = (typeof dungeonNames)[number];
export type RegularDungeon = Exclude<DungeonName, 'Sky Keep'>;
export function isDungeon(id: string): id is DungeonName {
    const names: readonly string[] = dungeonNames;
    return names.includes(id);
}

export function isRegularDungeon(id: string): id is RegularDungeon {
    return isDungeon(id) && id !== 'Sky Keep';
}

export function defaultRequiredDungeons(): RegularDungeon[] {
    return dungeonNames.filter(isRegularDungeon);
}

export function parseRequiredDungeonsFromSlotData(
    raw: unknown,
): RegularDungeon[] {
    if (
        Array.isArray(raw) &&
        raw.length > 0 &&
        raw.every((entry) => typeof entry === 'string')
    ) {
        return raw.filter(isRegularDungeon);
    }

    return defaultRequiredDungeons();
}

/** AP boss location short names from the data package → tracker dungeon names. */
const AP_GOAL_BOSS_LOCATION_TO_DUNGEON: Record<string, RegularDungeon> = {
    'Skyview Temple - Defeat Boss': 'Skyview',
    'Earth Temple - Defeat Boss': 'Earth Temple',
    'Lanayru Mining Facility - Defeat Boss': 'Lanayru Mining Facility',
    'Ancient Cistern - Defeat Boss': 'Ancient Cistern',
    'Sandship - Defeat Boss': 'Sandship',
    'Fire Sanctuary - Defeat Boss': 'Fire Sanctuary',
};

export function dungeonFromApGoalLocationName(
    locationName: string,
): RegularDungeon | undefined {
    return AP_GOAL_BOSS_LOCATION_TO_DUNGEON[locationName];
}

export function isGoalDungeonLocationCodes(raw: unknown): raw is number[] {
    return (
        Array.isArray(raw) &&
        raw.length > 0 &&
        raw.every((entry) => typeof entry === 'number')
    );
}

/**
 * Maps AP `goal_dungeon_location_codes` entries to tracker required dungeons.
 * Returns `undefined` when the list is empty/missing (use all dungeons) or when
 * location names are not available yet (wait for the data package).
 */
export function parseRequiredDungeonsFromGoalDungeonLocationCodes(
    raw: unknown,
    idToLocation?: Record<number, string>,
): RegularDungeon[] | undefined {
    if (!isGoalDungeonLocationCodes(raw)) {
        return undefined;
    }
    if (idToLocation === undefined) {
        return undefined;
    }

    const dungeons: RegularDungeon[] = [];
    const seen = new Set<RegularDungeon>();
    for (const locationId of raw) {
        const locationName = idToLocation[locationId];
        if (locationName === undefined) {
            continue;
        }
        const dungeon = dungeonFromApGoalLocationName(locationName);
        if (dungeon !== undefined && !seen.has(dungeon)) {
            seen.add(dungeon);
            dungeons.push(dungeon);
        }
    }

    return dungeons.length > 0 ? dungeons : undefined;
}

export type RequiredDungeonsSlotDataResolution = {
    dungeons: RegularDungeon[];
    authoritative: boolean;
    source: 'goal_dungeon_location_codes' | 'required_dungeons' | 'default';
    pendingGoalLocationCodes: boolean;
};

export function resolveRequiredDungeonsFromSlotData(
    slotData: Record<string, unknown>,
    idToLocation?: Record<number, string>,
): RequiredDungeonsSlotDataResolution {
    const goalCodesRaw = slotData['goal_dungeon_location_codes'];
    const fromGoalCodes = parseRequiredDungeonsFromGoalDungeonLocationCodes(
        goalCodesRaw,
        idToLocation,
    );
    if (fromGoalCodes !== undefined) {
        return {
            dungeons: fromGoalCodes,
            authoritative: true,
            source: 'goal_dungeon_location_codes',
            pendingGoalLocationCodes: false,
        };
    }

    if (isGoalDungeonLocationCodes(goalCodesRaw)) {
        return {
            dungeons: defaultRequiredDungeons(),
            authoritative: false,
            source: 'default',
            pendingGoalLocationCodes: true,
        };
    }

    const requiredDungeonsRaw = slotData['required_dungeons'];
    if (
        Array.isArray(requiredDungeonsRaw) &&
        requiredDungeonsRaw.length > 0 &&
        requiredDungeonsRaw.every((entry) => typeof entry === 'string')
    ) {
        const dungeons = requiredDungeonsRaw.filter(isRegularDungeon);
        if (dungeons.length > 0) {
            return {
                dungeons,
                authoritative: true,
                source: 'required_dungeons',
                pendingGoalLocationCodes: false,
            };
        }
    }

    return {
        dungeons: defaultRequiredDungeons(),
        authoritative: false,
        source: 'default',
        pendingGoalLocationCodes: false,
    };
}
