import { describe, expect, it } from 'vitest';
import { findMapForChecks } from './mapNavigation';
import type { MapPack, PackMap } from './pack';

const map = (id: string, checkIds: string[]): PackMap => ({
    id,
    name: id,
    image: 'images/map.png',
    width: 100,
    height: 100,
    entranceIds: [],
    markers: [
        { id: 'checks', kind: 'checks', label: id, x: 50, y: 50, checkIds },
    ],
});
const pack = (...maps: PackMap[]): MapPack => ({
    version: 1,
    id: 'test',
    name: 'test',
    maps,
});

describe('Dungeon map navigation', () => {
    it('finds the map with direct dungeon placements without relying on map or marker names', () => {
        expect(
            findMapForChecks(
                pack(map('province', ['a', 'b', 'other']), map('cave', ['c'])),
                ['a', 'b'],
            ),
        ).toBe('province');
    });
    it('prefers the map containing most of the dungeon when its checks are split', () => {
        expect(
            findMapForChecks(
                pack(map('small', ['a']), map('main', ['b', 'c'])),
                ['a', 'b', 'c'],
            ),
        ).toBe('main');
    });
    it('prefers a dedicated map over an overview when both contain the same dungeon checks', () => {
        expect(
            findMapForChecks(
                pack(
                    map('overview', ['a', 'b', 'other']),
                    map('dungeon', ['a', 'b']),
                ),
                ['a', 'b'],
            ),
        ).toBe('dungeon');
    });
    it('deduplicates repeated placements and ignores navigation links', () => {
        const overview = map('overview', ['a']);
        overview.markers.push(
            { ...overview.markers[0], id: 'repeat' },
            {
                id: 'link',
                kind: 'link',
                label: 'Child',
                x: 20,
                y: 20,
                targetMapId: 'child',
                navigation: 'child',
            },
        );
        expect(
            findMapForChecks(pack(overview, map('child', ['a', 'b'])), [
                'a',
                'b',
            ]),
        ).toBe('child');
    });
    it('returns no map for unplaced or empty regions, with stable pack order for ties', () => {
        const document = pack(map('first', ['a']), map('second', ['a']));
        expect(findMapForChecks(document, [])).toBeUndefined();
        expect(findMapForChecks(document, ['missing'])).toBeUndefined();
        expect(findMapForChecks(document, ['a'])).toBe('first');
    });
});
