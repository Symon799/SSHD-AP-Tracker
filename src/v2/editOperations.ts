import type { CheckMarker, MapMarker, MapPack, PackMap } from './pack';

function checkGroup(map: PackMap, id: string): CheckMarker {
    const marker = map.markers.find((entry) => entry.id === id);
    if (!marker || marker.kind !== 'checks')
        throw new Error('Select a check marker.');
    return marker;
}

function beside(
    map: PackMap,
    source: CheckMarker,
    position?: { x: number; y: number },
) {
    const padX = Math.min(16, map.width / 2),
        padY = Math.min(16, map.height / 2);
    return {
        x: Math.max(
            padX,
            Math.min(
                map.width - padX,
                position?.x ??
                    source.x + (source.x + 45 <= map.width - padX ? 45 : -45),
            ),
        ),
        y: Math.max(padY, Math.min(map.height - padY, position?.y ?? source.y)),
    };
}

export function mergeMarkers(
    map: PackMap,
    sourceId: string,
    targetId: string,
): PackMap {
    if (sourceId === targetId) return map;
    const source = checkGroup(map, sourceId);
    const target = checkGroup(map, targetId);
    return {
        ...map,
        markers: map.markers
            .filter((marker) => marker.id !== sourceId)
            .map((marker) =>
                marker.id === targetId
                    ? {
                          ...target,
                          checkIds: [
                              ...new Set([
                                  ...target.checkIds,
                                  ...source.checkIds,
                              ]),
                          ],
                      }
                    : marker,
            ),
    };
}

export function extractChecks(
    map: PackMap,
    sourceId: string,
    ids: string[],
    names: Record<string, string>,
    makeId: () => string,
    position?: { x: number; y: number },
    targetId?: string,
): PackMap {
    const source = checkGroup(map, sourceId);
    const selected = [...new Set(ids)];
    if (
        !selected.length ||
        selected.some((id) => !source.checkIds.includes(id))
    )
        throw new Error('Select checks belonging to this group.');
    if (sourceId === targetId) return map;
    const target = targetId ? checkGroup(map, targetId) : undefined;
    const remaining = source.checkIds.filter((id) => !selected.includes(id));
    const markers: MapMarker[] = map.markers.flatMap((marker) => {
        if (marker.id === sourceId)
            return remaining.length ? [{ ...source, checkIds: remaining }] : [];
        if (target && marker.id === targetId)
            return [
                {
                    ...target,
                    checkIds: [...new Set([...target.checkIds, ...selected])],
                },
            ];
        return [marker];
    });
    if (!target) {
        markers.push({
            id: makeId(),
            kind: 'checks',
            label:
                selected.length === 1
                    ? (names[selected[0]] ?? selected[0])
                    : `${source.label} (selection)`,
            ...beside(map, source, position),
            checkIds: selected,
        });
    }
    return { ...map, markers };
}

export function expandGroupToMap(
    pack: MapPack,
    parentId: string,
    sourceId: string,
    makeId: () => string,
    options?: Pick<PackMap, 'name' | 'image' | 'width' | 'height'>,
    selectedIds?: readonly string[],
): { pack: MapPack; mapId: string } {
    const parent = pack.maps.find((map) => map.id === parentId);
    if (!parent) throw new Error('Map not found.');
    const source = checkGroup(parent, sourceId);
    const checks = selectedIds ? [...new Set(selectedIds)] : source.checkIds;
    if (
        !checks.length ||
        checks.some((check) => !source.checkIds.includes(check))
    )
        throw new Error('Select checks belonging to this group.');
    const remaining = source.checkIds.filter(
        (check) => !checks.includes(check),
    );
    const id = makeId();
    const width = options?.width ?? parent.width;
    const height = options?.height ?? parent.height;
    const child: PackMap = {
        id,
        name: options?.name ?? source.label,
        image: options?.image ?? parent.image,
        width,
        height,
        entranceIds: [],
        markers: [
            {
                id: makeId(),
                kind: 'link',
                navigation: 'back',
                label: `Back to ${parent.name}`,
                x: Math.min(24, width / 2),
                y: Math.min(24, height / 2),
                targetMapId: parentId,
            },
            {
                ...source,
                id: makeId(),
                label: options?.name ?? source.label,
                x: width / 2,
                y: height / 2,
                checkIds: [...checks],
            },
        ],
    };
    const childLink: MapMarker = {
        id: remaining.length ? makeId() : source.id,
        kind: 'link',
        navigation: 'child',
        label: remaining.length
            ? (options?.name ?? `${source.label} (selection)`)
            : source.label,
        ...(remaining.length
            ? beside(parent, source)
            : { x: source.x, y: source.y }),
        targetMapId: id,
    };
    return {
        mapId: id,
        pack: {
            ...pack,
            maps: [
                ...pack.maps.map((map) =>
                    map.id === parentId
                        ? {
                              ...map,
                              markers: [
                                  ...map.markers.map(
                                      (marker): MapMarker =>
                                          marker.id === sourceId
                                              ? remaining.length
                                                  ? {
                                                        ...source,
                                                        checkIds: remaining,
                                                    }
                                                  : childLink
                                              : marker,
                                  ),
                                  ...(remaining.length ? [childLink] : []),
                              ],
                          }
                        : map,
                ),
                child,
            ],
        },
    };
}

export function mapCheckIds(
    pack: MapPack,
    mapId: string,
    visited = new Set<string>(),
): string[] {
    if (visited.has(mapId)) return [];
    visited.add(mapId);
    const map = pack.maps.find((entry) => entry.id === mapId);
    return [
        ...new Set(
            map?.markers.flatMap((marker) =>
                marker.kind === 'checks'
                    ? marker.checkIds
                    : marker.navigation === 'child' &&
                        !marker.exitId &&
                        marker.targetMapId
                      ? mapCheckIds(pack, marker.targetMapId, visited)
                      : [],
            ) ?? [],
        ),
    ];
}
