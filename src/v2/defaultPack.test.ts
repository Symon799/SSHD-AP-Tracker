import fs from 'node:fs';
import { expect, it } from 'vitest';
import { decodeArchive } from './packIO';

it('ships lehonno maps and their images without rewriting authored data', () => {
    const document = decodeArchive(
        new Uint8Array(fs.readFileSync('src/v2/data/default-map-pack.zip')),
    );
    expect(document.pack.maps).toHaveLength(10);
    expect(document.pack.maps.map((map) => map.name)).toContain(
        'Knight Academy F1',
    );
    expect(
        document.pack.maps.find((map) => map.id === 'skyloft')?.markers,
    ).toHaveLength(57);
    for (const map of document.pack.maps)
        expect(document.images[map.image]).toMatch(/^data:image\//);
});
