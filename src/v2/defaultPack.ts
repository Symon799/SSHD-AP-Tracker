import type { MapDocument } from './pack';
import { decodeArchive } from './packIO';

export async function loadDefaultDocument(): Promise<MapDocument> {
    const response = await fetch(
        new URL('./data/default-map-pack.zip', import.meta.url),
    );
    if (!response.ok) throw new Error('Cannot load the default map pack.');
    return decodeArchive(new Uint8Array(await response.arrayBuffer()));
}
