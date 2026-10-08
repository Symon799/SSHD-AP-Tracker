import { describe, expect, it } from 'vitest';
import {
    parseRequiredDungeonsFromGoalDungeonLocationCodes,
    resolveRequiredDungeonsFromSlotData,
} from './Locations';

const ID_TO_LOCATION: Record<number, string> = {
    2773700: 'Skyview Temple - Defeat Boss',
    2773729: 'Earth Temple - Defeat Boss',
    2773774: 'Lanayru Mining Facility - Defeat Boss',
    2773798: 'Ancient Cistern - Defeat Boss',
    2773818: 'Sandship - Defeat Boss',
    2773848: 'Fire Sanctuary - Defeat Boss',
};

describe('parseRequiredDungeonsFromGoalDungeonLocationCodes', () => {
    it('returns undefined when the list is missing or empty', () => {
        expect(
            parseRequiredDungeonsFromGoalDungeonLocationCodes(
                undefined,
                ID_TO_LOCATION,
            ),
        ).toBeUndefined();
        expect(
            parseRequiredDungeonsFromGoalDungeonLocationCodes(
                [],
                ID_TO_LOCATION,
            ),
        ).toBeUndefined();
    });

    it('returns undefined when location names are not loaded yet', () => {
        expect(
            parseRequiredDungeonsFromGoalDungeonLocationCodes(
                [2773700, 2773729],
                undefined,
            ),
        ).toBeUndefined();
    });

    it('maps boss location ids to tracker dungeon names', () => {
        expect(
            parseRequiredDungeonsFromGoalDungeonLocationCodes(
                [2773700, 2773729, 2773774],
                ID_TO_LOCATION,
            ),
        ).toEqual(['Skyview', 'Earth Temple', 'Lanayru Mining Facility']);
    });
});

describe('resolveRequiredDungeonsFromSlotData', () => {
    it('defaults to all dungeons without overriding the tracker when goal codes are absent', () => {
        const resolution = resolveRequiredDungeonsFromSlotData(
            {},
            ID_TO_LOCATION,
        );
        expect(resolution.authoritative).toBe(false);
        expect(resolution.source).toBe('default');
        expect(resolution.dungeons).toHaveLength(6);
    });

    it('uses goal_dungeon_location_codes when present', () => {
        const resolution = resolveRequiredDungeonsFromSlotData(
            {
                goal_dungeon_location_codes: [2773700, 2773818],
            },
            ID_TO_LOCATION,
        );
        expect(resolution).toEqual({
            dungeons: ['Skyview', 'Sandship'],
            authoritative: true,
            source: 'goal_dungeon_location_codes',
            pendingGoalLocationCodes: false,
        });
    });

    it('waits for the data package when goal codes exist but names are unknown', () => {
        const resolution = resolveRequiredDungeonsFromSlotData({
            goal_dungeon_location_codes: [2773700],
        });
        expect(resolution.authoritative).toBe(false);
        expect(resolution.pendingGoalLocationCodes).toBe(true);
        expect(resolution.source).toBe('default');
    });
});
