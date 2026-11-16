import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
    assetPath,
    parsePack,
    upgradeLegacyHoverTitles,
    type MapDocument,
} from './pack';

const maxArchiveSize = 32 * 1024 * 1024;
const maxAssetSize = 8 * 1024 * 1024;
const maxExpandedSize = 64 * 1024 * 1024;

export function imageMime(bytes: Uint8Array): string | undefined {
    if (
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71
    )
        return 'image/png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        return 'image/jpeg';
    if (
        strFromU8(bytes.slice(0, 4)) === 'RIFF' &&
        strFromU8(bytes.slice(8, 12)) === 'WEBP'
    )
        return 'image/webp';
    return undefined;
}

function imageUrl(bytes: Uint8Array) {
    const mime = imageMime(bytes);
    if (!mime) throw new Error('Only PNG, JPEG and WebP images are supported.');
    let binary = '';
    for (let start = 0; start < bytes.length; start += 8192)
        binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    return `data:${mime};base64,${btoa(binary)}`;
}

export function decodeArchive(bytes: Uint8Array): MapDocument {
    if (bytes.length > maxArchiveSize)
        throw new Error('ZIP exceeds the 32 MB limit.');
    let size = 0;
    let count = 0;
    const files = unzipSync(bytes, {
        filter: (file) => {
            count++;
            size += file.originalSize;
            if (
                count > 300 ||
                size > maxExpandedSize ||
                file.originalSize > maxAssetSize
            )
                throw new Error('ZIP exceeds the expanded-size limits.');
            if (file.name !== 'pack.json' && !assetPath(file.name))
                throw new Error(`Unsupported ZIP path: ${file.name}`);
            return true;
        },
    });
    if (!files['pack.json'])
        throw new Error('The ZIP must contain pack.json at its root.');
    const pack = upgradeLegacyHoverTitles(
        parsePack(JSON.parse(strFromU8(files['pack.json'])) as unknown),
    );
    const images: Record<string, string> = {};
    for (const map of pack.maps) {
        if (!files[map.image]) throw new Error(`Missing image: ${map.image}`);
        images[map.image] = imageUrl(files[map.image]);
    }
    return { pack, images };
}

export async function encodeArchive(
    document: MapDocument,
): Promise<Uint8Array> {
    const pack = parsePack(document.pack);
    const files: Record<string, Uint8Array> = {
        'pack.json': strToU8(JSON.stringify(pack, null, 2)),
    };
    let size = files['pack.json'].length;
    for (const path of new Set(pack.maps.map((map) => map.image))) {
        const url = document.images[path];
        if (!url) throw new Error(`Missing image: ${path}`);
        if (!url.startsWith('data:image/')) {
            const resolved = new URL(url, window.location.href);
            if (resolved.origin !== window.location.origin)
                throw new Error('Remote image URLs are not allowed.');
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Cannot read ${path}.`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!imageMime(bytes) || bytes.length > maxAssetSize)
            throw new Error(`Invalid or oversized image: ${path}`);
        size += bytes.length;
        if (size > maxExpandedSize) throw new Error('Pack exceeds 64 MB.');
        files[path] = bytes;
    }
    return zipSync(files, { level: 6 });
}

export async function importImage(
    file: File,
): Promise<{ url: string; width: number; height: number }> {
    if (file.size > maxAssetSize) throw new Error('Image exceeds 8 MB.');
    const url = imageUrl(new Uint8Array(await file.arrayBuffer()));
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
        image.width > 16384 ||
        image.height > 16384 ||
        image.width * image.height > 32_000_000
    )
        throw new Error('Image dimensions are too large.');
    return { url, width: image.width, height: image.height };
}

export function downloadFile(
    bytes: Uint8Array,
    filename: string,
    type = 'application/zip',
) {
    const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
