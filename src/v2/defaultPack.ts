import type { MapDocument } from './pack';
import { decodeArchive } from './packIO';
import { checkArchiveSize } from './packLimits';

export async function loadDefaultDocument(): Promise<MapDocument> {
    // Ship the ZIP in two assets to stay below the repository file size limit.
    const urls = [
        new URL('./data/default-map-pack.zip.1', import.meta.url),
        new URL('./data/default-map-pack.zip.2', import.meta.url),
    ];
    const chunks = await Promise.all(
        urls.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok)
                throw new Error('Cannot load the default map pack.');
            return new Uint8Array(await response.arrayBuffer());
        }),
    );
    const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
    checkArchiveSize(size);
    const archive = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        archive.set(chunk, offset);
        offset += chunk.length;
    }
    return decodeArchive(archive);
}
