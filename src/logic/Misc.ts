import type { TypedOptions } from '../permalink/SettingsTypes';
import type { Logic } from './Logic';
import {
    cubeCheckToCubeCollected,
    dungeonCompletionItems,
    mapToCubeCollectedRequirement,
} from './TrackerModifications';

export function getAdditionalItems(
    logic: Logic,
    inventory: Record<string, number>,
    checkedChecks: Set<string>,
    settings?: Partial<TypedOptions>,
    apGratitudeCrystals?: { singles: number; packs: number },
) {
    const result: Record<string, number> = {};
    // Completed dungeons
    for (const [dungeon, completionCheck] of Object.entries(
        logic.dungeonCompletionRequirements,
    )) {
        if (checkedChecks.has(completionCheck)) {
            result[dungeonCompletionItems[dungeon]] = 1;
        }
    }

    if (inventory['Triforce'] === 3) {
        result[dungeonCompletionItems['Sky Keep']] = 1;
    }

    // AP exposes some SSHD progression events as checked locations even though
    // they are virtual logic nodes rather than real tracker checks.
    for (const check of checkedChecks) {
        if (!(check in logic.checks) && logic.itemBits[check] !== undefined) {
            result[check] = 1;
        }
    }

    // If this is a goddess cube check, mark the requirement as checked
    // since this is the requirement used by the goddess chests.
    for (const check of checkedChecks) {
        const cubeCollectedItem =
            cubeCheckToCubeCollected[check] ??
            (logic.checks[check]?.type === 'goddess_cube'
                ? mapToCubeCollectedRequirement(check)
                : undefined);
        if (cubeCollectedItem) {
            result[cubeCollectedItem] = 1;
        }
    }

    const looseCrystals =
        apGratitudeCrystals?.singles ?? inventory['Gratitude Crystal'] ?? 0;
    const packCount =
        apGratitudeCrystals?.packs ?? inventory['Gratitude Crystal Pack'] ?? 0;
    result['Gratitude Crystal'] = looseCrystals + packCount * 5;
    if (settings?.['tadtone-shuffle'] === 'off') {
        result['Group of Tadtones'] = Math.max(
            inventory['Group of Tadtones'] ?? 0,
            17,
        );
    }
    return result;
}
