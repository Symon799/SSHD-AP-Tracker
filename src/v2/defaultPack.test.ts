import fs from 'node:fs';
import { expect, it } from 'vitest';
import { decodeArchive } from './packIO';

it('ships the merged v0.2 pack with Skyloft and Lanayru maps', () => {
    const document = decodeArchive(
        new Uint8Array(fs.readFileSync('src/v2/data/default-map-pack.zip')),
    );
    expect(document.pack.name).toBe('SSHD_Pack_v0.2');
    expect(document.pack.maps).toHaveLength(30);
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
