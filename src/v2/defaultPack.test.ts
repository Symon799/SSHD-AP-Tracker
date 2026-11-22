import fs from 'node:fs';
import { expect, it } from 'vitest';
import { mapCheckIds } from './editOperations';
import { placedChecks } from './pack';
import { decodeArchive } from './packIO';

it('ships all three surface provinces alongside the Sky and Skyloft maps', () => {
    const parts = [1, 2].map((part) =>
        fs.readFileSync(`src/v2/data/default-map-pack.zip.${part}`),
    );
    for (const part of parts)
        expect(part.length).toBeLessThan(100 * 1024 * 1024);
    const document = decodeArchive(Buffer.concat(parts));
    expect(document.pack.name).toBe('Sky Added');
    expect(document.pack.maps).toHaveLength(71);
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
}, 30_000);
