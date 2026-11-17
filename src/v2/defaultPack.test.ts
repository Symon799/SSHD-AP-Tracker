import fs from 'node:fs';
import { expect, it } from 'vitest';
import { placedChecks } from './pack';
import { decodeArchive } from './packIO';

it('ships the v0.3 pack with Skyloft, Lanayru and new Sky maps', () => {
    const document = decodeArchive(
        new Uint8Array(fs.readFileSync('src/v2/data/default-map-pack.zip')),
    );
    expect(document.pack.name).toBe('Sky Added');
    expect(document.pack.maps).toHaveLength(32);
    expect(placedChecks(document.pack).size).toBe(15016);
    expect(document.pack.maps.map((map) => map.name)).toEqual(
        expect.arrayContaining(['Bug Heaven', 'Lumpy Pumpkin']),
    );
    expect(document.pack.maps.map((map) => map.name)).toContain(
        'Knight Academy F1',
    );
    expect(
        document.pack.maps.find((map) => map.id === 'skyloft')?.markers,
    ).toHaveLength(57);
    expect(document.pack.maps.map((map) => map.name)).toContain('Sandship B3');
    for (const map of document.pack.maps)
        expect(document.images[map.image]).toMatch(/^data:image\//);
});
