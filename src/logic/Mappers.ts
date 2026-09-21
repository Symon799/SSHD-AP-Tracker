import type { OptionDefs, TypedOptions } from '../permalink/SettingsTypes';
import { appDebug } from '../utils/Debug';
import type { Requirements } from './bitlogic/BitLogic';
import { BitVector } from './bitlogic/BitVector';
import { LogicalExpression } from './bitlogic/LogicalExpression';
import { itemName } from './Inventory';
import { type ExitMapping, dungeonNames } from './Locations';
import type { Logic } from './Logic';
import { LogicBuilder } from './LogicBuilder';
import {
    completeTriforceReq,
    gotOpeningReq,
    gotRaisingReq,
    hordeDoorReq,
    impaSongCheck,
    runtimeOptions,
    swordsToAdd,
} from './ThingsThatWouldBeNiceToHaveInTheDump';
import {
    dungeonCompletionItems,
    fullSongOfTheHeroPart,
    sothItemReplacement,
    sothItems,
    triforceItemReplacement,
    triforceItems,
} from './TrackerModifications';

export const TimeOfDay = {
    DayOnly: 1,
    NightOnly: 2,
    Both: 3,
} as const;
export type TTimeOfDay = typeof TimeOfDay;

const sshdSettingRequirementPattern =
    /^\\SSHD Setting\\(.+) (==|!=|>=|<=) (.+)$/;

function settingCommand(settingName: string) {
    return settingName.replace(/_/g, '-');
}

function normalizeSettingValue(value: unknown) {
    if (typeof value === 'boolean') {
        return value ? 'on' : 'off';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        return value;
    }
    return undefined;
}

function settingComparisonMatches(
    options: OptionDefs,
    settings: TypedOptions,
    settingName: string,
    operator: string,
    comparedValue: string,
) {
    const command = settingCommand(settingName);
    const actual = normalizeSettingValue(
        (settings as Record<string, unknown>)[command],
    );
    if (actual === undefined) {
        return false;
    }

    if (operator === '==') {
        return actual === comparedValue;
    }
    if (operator === '!=') {
        return actual !== comparedValue;
    }

    const option = options.find((entry) => entry.command === command);
    if (option?.type === 'singlechoice') {
        const actualIndex = option.choices.indexOf(actual);
        const comparedIndex = option.choices.indexOf(comparedValue);
        if (actualIndex === -1 || comparedIndex === -1) {
            return false;
        }
        return operator === '>='
            ? actualIndex >= comparedIndex
            : actualIndex <= comparedIndex;
    }

    const actualNumber = Number(actual);
    const comparedNumber = Number(comparedValue);
    if (Number.isNaN(actualNumber) || Number.isNaN(comparedNumber)) {
        return false;
    }
    return operator === '>='
        ? actualNumber >= comparedNumber
        : actualNumber <= comparedNumber;
}

export function mapSettings(
    logic: Logic,
    options: OptionDefs,
    settings: TypedOptions,
    exits: ExitMapping[],
    requiredDungeons: string[],
) {
    const requirements: Requirements = {};
    const b = new LogicBuilder(logic.allItems, logic.itemLookup, requirements);

    for (const option of runtimeOptions) {
        const [item, command, expect] = option;
        const val = settings[command];
        const match =
            val !== undefined &&
            (typeof expect === 'function' ? expect(val) : expect === val);
        if (match) {
            appDebug('setting', item);
            b.trySet(item, b.true());
        }
    }

    for (const item of logic.allItems) {
        const match = item.match(sshdSettingRequirementPattern);
        if (
            match &&
            settingComparisonMatches(
                options,
                settings,
                match[1],
                match[2],
                match[3],
            )
        ) {
            b.set(item, b.true());
        }
    }

    // https://github.com/NindyBK/ssrnppbuild/pull/1
    if (logic.itemBits['Lanayru Mining Facility Unrequired'] !== undefined) {
        for (const dungeon of dungeonNames) {
            if (!requiredDungeons.includes(dungeon)) {
                b.trySet(`${dungeon} Unrequired`, b.true());
            } else {
                b.trySet(`${dungeon} Required`, b.true());
            }
        }
    }

    for (const option of options) {
        if (
            option.type === 'multichoice' &&
            (option.command === 'enabled-tricks-glitched' ||
                option.command === 'enabled-tricks-bitless')
        ) {
            const vals = settings[option.command];
            for (const option of vals) {
                b.trySet(`${option} Trick`, b.true());
            }
        }
    }

    const hasItem = (item: string) => logic.itemBits[item] !== undefined;
    const neededSwords = swordsToAdd[settings['got-sword-requirement']];
    const swordRequirement =
        neededSwords === 0
            ? 'Progressive Sword'
            : `Progressive Sword x ${neededSwords}`;
    let openGotExpr =
        neededSwords === 0 || !hasItem(swordRequirement)
            ? b.true()
            : b.singleBit(swordRequirement);
    let hordeDoorExpr =
        settings['triforce-required'] && hasItem(completeTriforceReq)
            ? b.singleBit(completeTriforceReq)
            : b.true();

    const allRequiredDungeonsBits = requiredDungeons.reduce((acc, dungeon) => {
        if (dungeon !== 'Sky Keep') {
            const bit = logic.itemBits[dungeonCompletionItems[dungeon]];
            if (bit !== undefined) {
                acc.setBit(bit);
            }
        }
        return acc;
    }, new BitVector());
    const dungeonsExpr = new LogicalExpression([allRequiredDungeonsBits]);

    if (settings['got-dungeon-requirement'] === 'Required') {
        openGotExpr = openGotExpr.and(dungeonsExpr);
    } else if (settings['got-dungeon-requirement'] === 'Unrequired') {
        hordeDoorExpr = hordeDoorExpr.and(dungeonsExpr);
    }

    const raiseGotExpr =
        settings['got-start'] === 'Raised' || !hasItem(impaSongCheck)
            ? b.true()
            : b.singleBit(impaSongCheck);

    b.trySet(gotOpeningReq, openGotExpr);
    b.trySet(gotRaisingReq, raiseGotExpr);
    b.trySet(hordeDoorReq, hordeDoorExpr);

    const mapConnection = (from: string, to: string) => {
        const exitArea = logic.areaGraph.areasByExit[from];
        const exitExpr = b.singleBit(from);

        let dayReq: LogicalExpression;
        let nightReq: LogicalExpression;

        if (exitArea.availability === 'abstract') {
            dayReq = exitExpr;
            nightReq = exitExpr;
        } else if (exitArea.availability === TimeOfDay.Both) {
            dayReq = exitExpr.and(b.singleBit(b.day(exitArea.id)));
            nightReq = exitExpr.and(b.singleBit(b.night(exitArea.id)));
        } else if (exitArea.availability === TimeOfDay.DayOnly) {
            dayReq = exitExpr;
            nightReq = b.false();
        } else if (exitArea.availability === TimeOfDay.NightOnly) {
            dayReq = b.false();
            nightReq = exitExpr;
        } else {
            throw new Error('bad ToD');
        }

        const entranceDef = logic.areaGraph.entrances[to];
        if (entranceDef.allowed_time_of_day === TimeOfDay.Both) {
            b.addAlternative(b.day(to), dayReq);
            b.addAlternative(b.night(to), nightReq);
        } else if (entranceDef.allowed_time_of_day === TimeOfDay.DayOnly) {
            b.addAlternative(to, dayReq);
        } else if (entranceDef.allowed_time_of_day === TimeOfDay.NightOnly) {
            b.addAlternative(to, nightReq);
        } else {
            throw new Error('bad ToD');
        }
    };

    for (const mapping of exits) {
        if (mapping.entrance) {
            mapConnection(mapping.exit.id, mapping.entrance.id);
        }
    }

    return requirements;
}

export function mapInventory(logic: Logic, itemCounts: Record<string, number>) {
    const requirements: Requirements = {};
    const b = new LogicBuilder(logic.allItems, logic.itemLookup, requirements);
    const trySet = (item: string) => b.trySet(item, b.true());

    for (const [item, count] of Object.entries(itemCounts)) {
        if (count === undefined) {
            continue;
        }
        if (item === sothItemReplacement) {
            for (let i = 1; i <= Math.min(count, sothItems.length); i++) {
                trySet(sothItems[i - 1]);
            }
            if (count > sothItems.length) {
                trySet(fullSongOfTheHeroPart);
            }
        } else if (item === triforceItemReplacement) {
            for (let i = 1; i <= count; i++) {
                trySet(triforceItems[i - 1]);
            }
        } else {
            for (let i = 1; i <= count; i++) {
                trySet(itemName(item, i));
            }
        }
    }

    return requirements;
}
