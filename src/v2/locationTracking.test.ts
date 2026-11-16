import { describe, expect, it } from 'vitest';
import { matchPlayerMap, type LocationRule } from './locationTracking';
import { parsePack, type MapPack } from './pack';
const pack = (rules: LocationRule[][]): MapPack => ({
    version: 1,
    id: 'test',
    name: 'test',
    maps: rules.map((trackingRules, index) => ({
        id: `map-${index}`,
        name: 'test',
        image: 'images/test.png',
        width: 100,
        height: 100,
        entranceIds: [],
        markers: [],
        trackingRules,
    })),
});
describe('Player map matching', () => {
    it('keeps old packs valid and leaves the map alone without telemetry or a match', () => {
        const data = pack([[]]);
        delete data.maps[0].trackingRules;
        expect(parsePack(data)).toEqual(data);
        expect(matchPlayerMap(data).reason).toBe('waiting');
        expect(matchPlayerMap(data, { stage: 'F100' }).reason).toBe('unmapped');
    });
    it('supports one dungeon map with several stages, optional room/layer refinements and exact arrivals', () => {
        const data = pack([
            [{ stage: 'D100' }, { stage: 'D100_1' }],
            [{ stage: 'D100', room: 2 }],
            [{ stage: 'D100', room: 2, layer: 1, entrance: 3 }],
        ]);
        expect(matchPlayerMap(data, { stage: 'D100_1' }).mapId).toBe('map-0');
        expect(matchPlayerMap(data, { stage: 'D100', room: 2 }).mapId).toBe(
            'map-1',
        );
        expect(
            matchPlayerMap(data, {
                stage: 'D100',
                room: 2,
                layer: 1,
                entrance: 3,
            }).mapId,
        ).toBe('map-2');
        expect(parsePack(data)).toEqual(data);
    });
    it('does not guess between equally specific maps', () => {
        expect(
            matchPlayerMap(
                pack([
                    [{ stage: 'F100', room: 1 }],
                    [{ stage: 'F100', layer: 0 }],
                ]),
                { stage: 'F100', room: 1, layer: 0 },
            ).reason,
        ).toBe('ambiguous');
    });
    it('rejects exact duplicate rules across maps, invalid constraints and excessive rules', () => {
        expect(() =>
            parsePack(pack([[{ stage: 'F100' }], [{ stage: 'F100' }]])),
        ).toThrow('more than once');
        for (const rule of [
            { stage: '' },
            { stage: 'F100', room: -1 },
            { stage: 'F100', layer: 0.5 },
        ])
            expect(() => parsePack(pack([[rule]]))).toThrow('tracking rules');
        expect(() =>
            parsePack(
                pack([
                    Array.from({ length: 201 }, (_, room) => ({
                        stage: 'F100',
                        room,
                    })),
                ]),
            ),
        ).toThrow('tracking rules');
    });
});
