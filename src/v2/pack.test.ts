import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
    linkDestination,
    packWarnings,
    parsePack,
    placedChecks,
    summarizeChecks,
    upgradeLegacyHoverTitles,
    type MapPack,
} from './pack';
import { decodeArchive, encodeArchive } from './packIO';

function fixture(): MapPack {
    return {
        version: 1,
        id: 'test',
        name: 'Test pack',
        maps: [
            {
                id: 'woods',
                name: 'Woods',
                image: 'images/map.png',
                width: 640,
                height: 480,
                entranceIds: [],
                markers: [
                    {
                        id: 'group',
                        kind: 'checks',
                        label: 'Group',
                        x: 100,
                        y: 80,
                        checkIds: ['a', 'b'],
                    },
                    {
                        id: 'door',
                        kind: 'link',
                        label: 'Door',
                        x: 400,
                        y: 200,
                        targetMapId: 'temple',
                    },
                ],
            },
            {
                id: 'temple',
                name: 'Temple',
                image: 'images/map.png',
                width: 640,
                height: 480,
                entranceIds: ['temple-entry'],
                markers: [],
            },
        ],
    };
}

describe('V2 map packs', () => {
    it('keeps hover titles optional, preserves explicit choices and rejects invalid flags', () => {
        const pack = fixture();
        const group = pack.maps[0].markers[0];
        expect(parsePack(pack).maps[0].markers[0]).not.toHaveProperty(
            'showNameOnHover',
        );
        for (const showNameOnHover of [true, false]) {
            Object.assign(group, { showNameOnHover });
            expect(parsePack(pack).maps[0].markers[0]).toMatchObject({
                showNameOnHover,
            });
        }
        Object.assign(group, { showNameOnHover: 'yes' });
        expect(() => parsePack(pack)).toThrow('hover title');
    });
    it('upgrades old V1 region titles without moving groups or overwriting custom choices', () => {
        const pack = fixture();
        pack.id = 'sshd-v2-v1-layout';
        pack.maps[0].markers[0].id = 'region-0';
        const upgraded = upgradeLegacyHoverTitles(pack);
        expect(upgraded.maps[0].markers[0]).toEqual({
            ...pack.maps[0].markers[0],
            showNameOnHover: true,
        });
        expect(upgradeLegacyHoverTitles(upgraded)).toBe(upgraded);
        Object.assign(upgraded.maps[0].markers[0], { showNameOnHover: false });
        expect(upgradeLegacyHoverTitles(upgraded)).toBe(upgraded);
        const custom = fixture();
        expect(upgradeLegacyHoverTitles(custom)).toBe(custom);
        pack.maps[0].markers[0].id = 'custom-group';
        expect(upgradeLegacyHoverTitles(pack)).toBe(pack);
    });
    it('allows repeated placements on a map while counting each logical check once', () => {
        const pack = fixture();
        pack.maps[0].markers.push({
            id: 'duplicate-placement',
            kind: 'checks',
            label: 'Same check',
            x: 200,
            y: 100,
            checkIds: ['a'],
        });
        expect(parsePack(pack)).toEqual(pack);
        expect(placedChecks(pack)).toEqual(new Set(['a', 'b']));
        expect(
            summarizeChecks(
                ['a', 'a', 'b'],
                new Set(['a', 'b']),
                new Set(['a']),
                () => false,
            ),
        ).toMatchObject({
            total: 2,
            checked: 1,
            remaining: 1,
            status: 'unavailable',
        });
    });
    it('round trips a presentation-only manifest', () => {
        expect(
            parsePack(JSON.parse(JSON.stringify(fixture())) as unknown),
        ).toEqual(fixture());
        expect(placedChecks(fixture())).toEqual(new Set(['a', 'b']));
    });
    it.each([
        'version',
        'duplicate-map',
        'duplicate-marker',
        'duplicate-check',
        'negative-position',
        'infinite-position',
        'broken-link',
        'remote-image',
        'duplicate-entrance',
    ])('rejects invalid data: %s', (type) => {
        const pack = fixture();
        const map = pack.maps[0];
        if (type === 'version') Object.assign(pack, { version: 2 });
        if (type === 'duplicate-map') pack.maps.push(structuredClone(map));
        if (type === 'duplicate-marker')
            map.markers.push(structuredClone(map.markers[0]));
        if (type === 'duplicate-check' && map.markers[0].kind === 'checks')
            map.markers[0].checkIds.push('a');
        if (type === 'negative-position') map.markers[0].x = -1;
        if (type === 'infinite-position') map.markers[0].x = Infinity;
        if (type === 'broken-link' && map.markers[1].kind === 'link')
            map.markers[1].targetMapId = 'absent';
        if (type === 'remote-image') map.image = 'https://example.org/map.png';
        if (type === 'duplicate-entrance') map.entranceIds = ['temple-entry'];
        expect(() => parsePack(pack)).toThrow();
    });
    it('allows multiple-map placements but counts unique checks', () => {
        const pack = fixture();
        pack.maps[1].markers.push({
            id: 'also-a',
            kind: 'checks',
            label: 'A',
            x: 0,
            y: 0,
            checkIds: ['a'],
        });
        expect(parsePack(pack)).toEqual(pack);
        expect(placedChecks(pack).size).toBe(2);
        const summary = summarizeChecks(
            ['a', 'b', 'a'],
            new Set(['a', 'b']),
            new Set(['a']),
            () => true,
        );
        expect(summary).toEqual({
            total: 2,
            checked: 1,
            remaining: 1,
            available: 1,
            status: 'available',
        });
    });
    it.each([
        { active: [], checked: [], available: [], status: 'empty' },
        {
            active: ['a', 'b'],
            checked: ['a', 'b'],
            available: [],
            status: 'done',
        },
        {
            active: ['a', 'b'],
            checked: [],
            available: ['a', 'b'],
            status: 'available',
        },
        { active: ['a', 'b'], checked: [], available: ['a'], status: 'mixed' },
        {
            active: ['a', 'b'],
            checked: [],
            available: [],
            status: 'unavailable',
        },
        { active: ['a'], checked: [], available: ['b'], status: 'unavailable' },
    ])(
        'derives marker state $status from active checks only',
        ({ active, checked, available, status }) => {
            expect(
                summarizeChecks(
                    ['a', 'b'],
                    new Set(active),
                    new Set(checked),
                    (id) => new Set<string>(available).has(id),
                ).status,
            ).toBe(status);
        },
    );
    it('reports unknown references without discarding the pack', () => {
        const pack = fixture();
        pack.maps[0].markers.push({
            id: 'er',
            kind: 'link',
            label: 'ER',
            x: 30,
            y: 30,
            exitId: 'unknown-exit',
        });
        expect(
            packWarnings(pack, new Set(['a']), new Set(), new Set()),
        ).toEqual([
            'Unknown check: b',
            'Unknown exit: unknown-exit',
            'Unknown entrance: temple-entry',
        ]);
    });
    it('never falls back to a vanilla destination for an unknown shuffled entrance', () => {
        const link = {
            id: 'er',
            kind: 'link' as const,
            label: 'ER',
            x: 10,
            y: 10,
            targetMapId: 'temple',
            exitId: 'shuffled',
        };
        expect(linkDestination(link, fixture(), undefined)).toBeUndefined();
        expect(linkDestination(link, fixture(), 'temple-entry')).toBe('temple');
        expect(
            linkDestination(
                { ...link, exitId: undefined },
                fixture(),
                undefined,
            ),
        ).toBe('temple');
    });
});

const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const bytes = Uint8Array.from(atob(png), (character) =>
    character.charCodeAt(0),
);
describe('V2 pack archives', () => {
    it('exports images and imports the same manifest', async () => {
        const original = {
            pack: fixture(),
            images: { 'images/map.png': `data:image/png;base64,${png}` },
        };
        const restored = decodeArchive(await encodeArchive(original));
        expect(restored).toEqual(original);
    });
    it.each([
        '../evil.png',
        'images/../../evil.png',
        'images/map.svg',
        'https://evil.test/map.png',
    ])('rejects unsafe archive paths: %s', (path) => {
        expect(() =>
            decodeArchive(
                zipSync({
                    'pack.json': strToU8(JSON.stringify(fixture())),
                    [path]: bytes,
                }),
            ),
        ).toThrow('Unsupported ZIP path');
    });
    it('rejects missing images and invalid image bytes', () => {
        expect(() =>
            decodeArchive(
                zipSync({ 'pack.json': strToU8(JSON.stringify(fixture())) }),
            ),
        ).toThrow('Missing image');
        expect(() =>
            decodeArchive(
                zipSync({
                    'pack.json': strToU8(JSON.stringify(fixture())),
                    'images/map.png': strToU8('<html>bad</html>'),
                }),
            ),
        ).toThrow('Only PNG');
    });
    it('rejects unsupported versions, malformed JSON and oversized entries', () => {
        expect(() =>
            decodeArchive(zipSync({ 'pack.json': strToU8('not json') })),
        ).toThrow();
        expect(() =>
            decodeArchive(zipSync({ 'pack.json': strToU8('{"version":2}') })),
        ).toThrow('Unsupported map pack version');
        expect(() =>
            decodeArchive(
                zipSync({
                    'pack.json': strToU8('{}'),
                    'images/map.png': new Uint8Array(9 * 1024 * 1024),
                }),
            ),
        ).toThrow('expanded-size');
    });
});
