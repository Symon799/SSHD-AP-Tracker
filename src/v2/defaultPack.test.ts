import { load } from 'js-yaml';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { parseLogic } from '../logic/Logic';
import type { RawLogic } from '../logic/UpstreamTypes';
import { applyDefaultPackEntrances } from './defaultPackEntrances';
import {
    applyDefaultTrackingRules,
    defaultTrackingRules,
} from './defaultPackTracking';
import { mapCheckIds } from './editOperations';
import { matchPlayerMap } from './locationTracking';
import { linkDestination, parsePack, placedChecks, type MapLink } from './pack';
import { decodeArchive } from './packIO';

it('ships all three surface provinces alongside the Sky and Skyloft maps', () => {
    const parts = [1, 2].map((part) =>
        fs.readFileSync(`src/v2/data/default-map-pack.zip.${part}`),
    );
    for (const part of parts)
        expect(part.length).toBeLessThan(100 * 1024 * 1024);
    const document = decodeArchive(Buffer.concat(parts));
    expect(document.pack.name).toBe('SSHD V2 - Faron V6');
    expect(document.pack.maps).toHaveLength(74);
    expect(placedChecks(document.pack).size).toBe(15016);
    expect(mapCheckIds(document.pack, 'faron')).toHaveLength(5875);
    expect(mapCheckIds(document.pack, 'eldin')).toHaveLength(2515);
    expect(document.pack.maps.map((map) => map.name)).toEqual(
        expect.arrayContaining([
            'Bug Heaven',
            'Lumpy Pumpkin',
            'Temple of Time',
            'LMF Boss Room',
            'Hall of Robots',
            'Deep Woods',
            'Ancient Cistern 1F',
            'Eldin Volcano',
            'Fire Sanctuary F1',
            'Sky Keep',
            "The Goddess's Silent Realm",
            "Din's Silent Realm",
        ]),
    );
    expect(document.pack.maps.map((map) => map.name)).toContain(
        'Knight Academy F1',
    );
    expect(
        document.pack.maps.find((map) => map.id === 'skyloft')?.markers,
    ).toHaveLength(57);
    expect(document.pack.maps.map((map) => map.name)).toContain('Sandship B3');
    expect(Object.keys(document.pack.checkEras ?? {})).toHaveLength(1342);
    for (const map of document.pack.maps)
        expect(document.images[map.image]).toMatch(/^data:image\//);

    const tracked = parsePack(applyDefaultTrackingRules(document.pack));
    for (const name of Object.keys(defaultTrackingRules))
        expect(tracked.maps.filter((map) => map.name === name)).toHaveLength(1);
    const mapFor = (location: Parameters<typeof matchPlayerMap>[1]) => {
        const { mapId } = matchPlayerMap(tracked, location);
        return tracked.maps.find((map) => map.id === mapId)?.name;
    };
    expect(mapFor({ stage: 'F020' })).toBe('The Sky');
    expect(mapFor({ stage: 'F023', room: 0, layer: 0 })).toBe('The Sky');
    expect(mapFor({ stage: 'F011r' })).toBe('Lumpy Pumpkin');
    expect(mapFor({ stage: 'F001r', room: 1 })).toBe('Knight Academy F1');
    expect(mapFor({ stage: 'F001r', room: 6 })).toBe('Knight Academy F2');
    expect(mapFor({ stage: 'F001r', room: 0 })).toBe('Skyloft');
    expect(mapFor({ stage: 'F101' })).toBe('Deep Woods');
    expect(mapFor({ stage: 'D101', room: 0 })).toBe('Ancient Cistern 1F');
    expect(mapFor({ stage: 'D101', room: 4 })).toBe('Ancient Cistern B1');
    expect(mapFor({ stage: 'S000' })).toBe("The Goddess's Silent Realm");
    expect(mapFor({ stage: 'S200' })).toBe("Din's Silent Realm");
    for (let room = 0; room < 9; room++)
        expect(mapFor({ stage: `D003_${room}` })).toBe('Sky Keep');
    expect(mapFor({ stage: 'F201_1', room: 0, layer: 0 })).toBe(
        'Volcano Summit',
    );
    expect(mapFor({ stage: 'F201_1', room: 0, layer: 4 })).toBe(
        'Bokoblin Base Summit',
    );
    expect(mapFor({ stage: 'F202_1' })).toBe('Bokoblin Base Lower Eldin Cave');
    expect(mapFor({ stage: 'F202_3' })).toBe('Lower Eldin Cave');
    expect(mapFor({ stage: 'D201', room: 9 })).toBe('Fire Sanctuary B1');
    expect(mapFor({ stage: 'F300_5' })).toBe('Hall of Robots');
    expect(mapFor({ stage: 'D301', room: 3 })).toBe('Sandship B1');
    expect(mapFor({ stage: 'D301', room: 9 })).toBe('Sandship B2');
    expect(mapFor({ stage: 'D301' })).toBe('Sandship 1F');
    expect(mapFor({ stage: 'D301_1' })).toBe('Lanayru Province');

    const { areaGraph } = parseLogic(
        load(fs.readFileSync('testData/sshd-dump.yaml', 'utf8')) as RawLogic,
    );
    const routed = parsePack(applyDefaultPackEntrances(tracked, areaGraph));
    const map = (name: string) => routed.maps.find((m) => m.name === name)!;
    expect(map('Faron Woods').markers).toHaveLength(100);
    expect(map('Skyview Temple').markers).toHaveLength(131);
    expect(mapCheckIds(routed, map('Ancient Cistern B1').id)).toHaveLength(4);
    const links = routed.maps.flatMap((m) =>
        m.markers.filter(
            (marker): marker is MapLink & { exitId: string } =>
                marker.kind === 'link' && Boolean(marker.exitId),
        ),
    );
    const arrivals = routed.maps.flatMap((m) => m.entranceIds);
    expect(links).toHaveLength(71);
    expect(new Set(links.map((marker) => marker.exitId)).size).toBe(71);
    expect(arrivals).toHaveLength(174);
    expect(arrivals.every((id) => areaGraph.entrances[id])).toBe(true);
    for (const link of links) {
        expect(
            linkDestination(
                link,
                routed,
                areaGraph.vanillaConnections[link.exitId],
            ),
            link.label,
        ).toBe(link.targetMapId);
        expect(
            linkDestination(link, routed, undefined),
            link.label,
        ).toBeUndefined();
    }
    for (const [name, parent, count] of [
        ['Sky Keep', 'Skyloft', 284],
        ["The Goddess's Silent Realm", 'Skyloft', 12],
        ["Din's Silent Realm", 'Eldin Volcano', 14],
    ] as const) {
        const target = map(name);
        const source = map(parent);
        expect(mapCheckIds(routed, target.id)).toHaveLength(count);
        expect(
            source.markers.some(
                (marker) =>
                    marker.kind === 'link' &&
                    marker.targetMapId === target.id &&
                    marker.navigation === 'child' &&
                    Boolean(marker.exitId),
            ),
            `Missing linked child: ${name}`,
        ).toBe(true);
        expect(
            target.markers.some(
                (marker) =>
                    marker.kind === 'link' &&
                    marker.targetMapId === source.id &&
                    Boolean(marker.exitId),
            ),
            `Missing return from ${name}`,
        ).toBe(true);
    }
    const door = map('Deep Woods').markers.find(
        (marker) => marker.kind === 'link' && marker.label === 'Skyview Temple',
    );
    if (door?.kind !== 'link' || !door.exitId)
        throw new Error('Missing Skyview door');
    const earthTemple = map('Earth Temple');
    const earthArrival = earthTemple.entranceIds.find(
        (id) =>
            areaGraph.entrances[id].short_name ===
            'Eldin Volcano -> Earth Temple',
    );
    expect(linkDestination(door, routed, earthArrival)).toBe(earthTemple.id);
    const shortcut = map('Faron Province').markers.find(
        (marker) => marker.kind === 'link' && marker.label === 'Skyview Temple',
    );
    expect(shortcut).not.toHaveProperty('exitId');
    expect(
        map('Bazaar').markers.some(
            (marker) => marker.kind === 'link' && marker.exitId,
        ),
    ).toBe(false);
    for (const m of tracked.maps) {
        expect(
            mapCheckIds(
                routed,
                m.id,
                (link) =>
                    linkDestination(
                        link,
                        routed,
                        link.exitId
                            ? areaGraph.vanillaConnections[link.exitId]
                            : undefined,
                    ) === link.targetMapId,
            ),
        ).toEqual(mapCheckIds(tracked, m.id));
    }
    expect(applyDefaultPackEntrances(routed, areaGraph)).toEqual(routed);
}, 30_000);
