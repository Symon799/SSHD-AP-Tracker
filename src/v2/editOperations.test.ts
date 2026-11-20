import { load } from 'js-yaml';
import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseLogic, type Logic } from '../logic/Logic';
import type { RawLogic } from '../logic/UpstreamTypes';
import {
    expandGroupToMap,
    extractChecks,
    mapCheckIds,
    mergeMarkers,
    transformMarkers,
} from './editOperations';
import { legacyDocument } from './legacyPack';
import { parsePack, placedChecks, type MapPack } from './pack';

function fixture(): MapPack {
    return {
        version: 1,
        id: 'test',
        name: 'Test',
        maps: [
            {
                id: 'root',
                name: 'Root',
                image: 'images/map.png',
                width: 843,
                height: 465,
                entranceIds: [],
                markers: [
                    {
                        id: 'first',
                        kind: 'checks',
                        label: 'Forest',
                        x: 100,
                        y: 100,
                        checkIds: ['a', 'b', 'patch', 'blade1', 'blade2'],
                    },
                    {
                        id: 'second',
                        kind: 'checks',
                        label: 'Temple',
                        x: 200,
                        y: 200,
                        checkIds: ['c'],
                    },
                ],
            },
        ],
    };
}
const names = {
    a: 'Chest A',
    b: 'Chest B',
    c: 'Chest C',
    patch: 'Woods - Grass Patch 1',
    blade1: 'Woods - Grass Patch 1 - Blade 1',
    blade2: 'Woods - Grass Patch 1 - Blade 2',
};
it('translates and scales check markers as one bounded selection', () => {
    const map = fixture().maps[0];
    const selected = new Set(['first', 'second']);
    const moved = transformMarkers(map, selected, -200, 500);
    expect(moved.markers.map(({ x, y }) => [x, y])).toEqual([
        [0, 365],
        [100, 465],
    ]);
    const scaled = transformMarkers(map, selected, 100, -50, {
        x: 1,
        y: 1,
    });
    expect(scaled.markers.map(({ x, y }) => [x, y])).toEqual([
        [100, 100],
        [300, 150],
    ]);
    const opposite = transformMarkers(map, selected, -200, -50, {
        x: -1,
        y: -1,
    });
    expect(opposite.markers.map(({ x, y }) => [x, y])).toEqual([
        [0, 50],
        [200, 200],
    ]);
    expect(map.markers[0]).toMatchObject({
        x: 100,
        y: 100,
        checkIds: ['a', 'b', 'patch', 'blade1', 'blade2'],
    });
});
const idFactory = () => {
    let index = 0;
    return () => `new-${index++}`;
};

describe('V2 editing operations', () => {
    it('creates a sub-map with its own name and image and fits all placements to its dimensions', () => {
        const result = expandGroupToMap(
            fixture(),
            'root',
            'first',
            idFactory(),
            {
                name: 'Detailed forest',
                image: 'images/detail.png',
                width: 120,
                height: 240,
            },
        );
        const child = result.pack.maps[1];
        expect(child).toMatchObject({
            name: 'Detailed forest',
            image: 'images/detail.png',
            width: 120,
            height: 240,
        });
        expect(
            child.markers.every(
                (entry) =>
                    entry.x >= 0 &&
                    entry.x <= 120 &&
                    entry.y >= 0 &&
                    entry.y <= 240,
            ),
        ).toBe(true);
        expect(parsePack(result.pack)).toEqual(result.pack);
        expect(placedChecks(result.pack)).toEqual(placedChecks(fixture()));
    });
    it('merges whole markers without losing checks or changing target placement', () => {
        const map = mergeMarkers(fixture().maps[0], 'first', 'second');
        expect(map.markers).toHaveLength(1);
        expect(map.markers[0]).toMatchObject({ id: 'second', x: 200, y: 200 });
        expect(
            map.markers[0].kind === 'checks' &&
                new Set(map.markers[0].checkIds),
        ).toEqual(placedChecks(fixture()));
        expect(() => mergeMarkers(map, 'missing', 'second')).toThrow();
    });
    it('extracts selected checks into one group and preserves the source remainder', () => {
        const original = fixture();
        const map = extractChecks(
            original.maps[0],
            'first',
            ['a', 'b'],
            names,
            idFactory(),
        );
        expect(
            map.markers.find((marker) => marker.id === 'first'),
        ).toMatchObject({ checkIds: ['patch', 'blade1', 'blade2'] });
        expect(
            map.markers.filter((marker) => marker.id.startsWith('new-')),
        ).toEqual([
            expect.objectContaining({ kind: 'checks', checkIds: ['a', 'b'] }),
        ]);
        expect(placedChecks({ ...original, maps: [map] })).toEqual(
            placedChecks(original),
        );
        expect(parsePack({ ...original, maps: [map] })).toBeTruthy();
    });
    it('creates a child map from only selected members and retains the source and its remainder', () => {
        const original = fixture();
        const result = expandGroupToMap(
            original,
            'root',
            'first',
            idFactory(),
            {
                name: 'Selected woods',
                image: original.maps[0].image,
                width: 320,
                height: 240,
            },
            ['a', 'b'],
        );
        const parent = result.pack.maps[0];
        expect(
            parent.markers.find((marker) => marker.id === 'first'),
        ).toMatchObject({
            kind: 'checks',
            checkIds: ['patch', 'blade1', 'blade2'],
        });
        expect(
            parent.markers.find((marker) => marker.kind === 'link'),
        ).toMatchObject({
            kind: 'link',
            label: 'Selected woods',
            targetMapId: result.mapId,
            navigation: 'child',
        });
        expect(mapCheckIds(result.pack, result.mapId)).toEqual(['a', 'b']);
        expect(result.pack.maps[1].markers).toHaveLength(2);
        expect(result.pack.maps[1].markers[1]).toMatchObject({
            kind: 'checks',
            label: 'Selected woods',
            x: 160,
            y: 120,
            checkIds: ['a', 'b'],
        });
        expect(placedChecks(result.pack)).toEqual(placedChecks(original));
        expect(parsePack(result.pack)).toEqual(result.pack);
    });
    it('rejects empty or foreign member selections before creating a child map', () => {
        for (const ids of [[], ['alien']]) {
            expect(() =>
                expandGroupToMap(
                    fixture(),
                    'root',
                    'first',
                    idFactory(),
                    undefined,
                    ids,
                ),
            ).toThrow('belonging');
        }
    });
    it('replaces the group when every member is selected for a child map', () => {
        const original = fixture();
        const source = original.maps[0].markers[0];
        if (source.kind !== 'checks') throw new Error('Expected check fixture');
        const result = expandGroupToMap(
            original,
            'root',
            'first',
            idFactory(),
            undefined,
            source.checkIds,
        );
        expect(result.pack.maps[0].markers).toHaveLength(2);
        expect(result.pack.maps[0].markers[0]).toMatchObject({
            id: 'first',
            kind: 'link',
        });
        expect(placedChecks(result.pack)).toEqual(placedChecks(original));
    });
    it('moves selected members to another group and removes an emptied source', () => {
        const original = fixture();
        const map = extractChecks(
            original.maps[0],
            'second',
            ['c'],
            names,
            idFactory(),
            undefined,
            'first',
        );
        expect(map.markers).toHaveLength(1);
        expect(placedChecks({ ...original, maps: [map] })).toEqual(
            placedChecks(original),
        );
        expect(() =>
            extractChecks(map, 'first', ['alien'], names, idFactory()),
        ).toThrow('belonging');
    });
    it('does not count a fixed child destination once its link is associated with a game exit', () => {
        const result = expandGroupToMap(
            fixture(),
            'root',
            'first',
            idFactory(),
        );
        const parent = result.pack.maps[0];
        const link = parent.markers[0];
        if (link.kind !== 'link') throw new Error('Expected child link');
        parent.markers[0] = { ...link, exitId: 'shuffled-door' };
        expect(mapCheckIds(result.pack, 'root')).toEqual(['c']);
        expect(mapCheckIds(result.pack, result.mapId)).toEqual([
            'a',
            'b',
            'patch',
            'blade1',
            'blade2',
        ]);
    });
    it('turns a region into one centered group with a return link and no lost references', () => {
        const original = fixture();
        const result = expandGroupToMap(original, 'root', 'first', idFactory());
        expect(result.pack.maps).toHaveLength(2);
        expect(result.pack.maps[0].markers[0]).toMatchObject({
            kind: 'link',
            id: 'first',
            targetMapId: result.mapId,
            navigation: 'child',
        });
        const child = result.pack.maps[1];
        expect(child.name).toBe('Forest');
        expect(child.markers[0]).toMatchObject({
            kind: 'link',
            targetMapId: 'root',
            navigation: 'back',
        });
        expect(
            child.markers.filter((marker) => marker.kind === 'checks'),
        ).toHaveLength(1);
        expect(child.markers).toHaveLength(2);
        expect(child.markers[1]).toMatchObject({
            kind: 'checks',
            label: 'Forest',
            x: child.width / 2,
            y: child.height / 2,
            checkIds: ['a', 'b', 'patch', 'blade1', 'blade2'],
        });
        expect(placedChecks(result.pack)).toEqual(placedChecks(original));
        expect(new Set(mapCheckIds(result.pack, 'root'))).toEqual(
            placedChecks(original),
        );
        expect(mapCheckIds(result.pack, child.id)).not.toContain('c');
        expect(parsePack(result.pack)).toEqual(result.pack);
    });
});

describe('V1 starter pack', () => {
    let logic: Logic;
    beforeAll(() => {
        logic = parseLogic(
            load(
                fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
            ) as RawLogic,
        );
    });
    it('contains every check exactly once on the five original map images', () => {
        const document = legacyDocument(logic);
        expect(document.pack.maps.map((map) => map.id)).toEqual([
            'world',
            'skyloft',
            'faron',
            'eldin',
            'lanayru',
        ]);
        expect(parsePack(document.pack)).toEqual(document.pack);
        const checks = document.pack.maps.flatMap((map) =>
            map.markers.flatMap((marker) =>
                marker.kind === 'checks' ? marker.checkIds : [],
            ),
        );
        expect(new Set(checks)).toEqual(new Set(Object.keys(logic.checks)));
        expect(checks.length).toBe(Object.keys(logic.checks).length);
        expect(
            document.pack.maps.every((map) =>
                map.markers.every(
                    (marker) =>
                        marker.kind === 'link' ||
                        marker.showNameOnHover === true,
                ),
            ),
        ).toBe(true);
    });
    it('uses V1 region ownership for Faron Woods, Deep Woods and dungeons', () => {
        const document = legacyDocument(logic);
        const map = document.pack.maps.find((entry) => entry.id === 'faron')!;
        for (const region of [
            'Faron Woods',
            'Deep Woods',
            'Skyview',
            'Ancient Cistern',
        ]) {
            expect(
                map.markers.find((marker) => marker.label === region),
            ).toMatchObject({
                kind: 'checks',
                checkIds: logic.checksByHintRegion[region],
            });
        }
        expect(
            document.pack.maps[0].markers.find(
                (marker) => marker.label === 'Skyloft',
            ),
        ).toMatchObject({ kind: 'link', targetMapId: 'skyloft' });
    });
});
