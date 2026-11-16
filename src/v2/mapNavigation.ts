import type { MapPack } from './pack';

export function findMapForChecks(
    pack: MapPack,
    checkIds: readonly string[],
): string | undefined {
    const wanted = new Set(checkIds);
    let best: { id: string; matches: number; total: number } | undefined;
    for (const map of pack.maps) {
        // Only direct placements count: overview links must not hide a detailed map.
        const placed = new Set(
            map.markers.flatMap((marker) =>
                marker.kind === 'checks' ? marker.checkIds : [],
            ),
        );
        const matches = [...placed].filter((id) => wanted.has(id)).length;
        if (!matches) continue;
        if (
            !best ||
            matches > best.matches ||
            (matches === best.matches && placed.size < best.total)
        )
            best = { id: map.id, matches, total: placed.size };
    }
    return best?.id;
}
