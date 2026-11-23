import type { CheckMarker, MapLink, MapMarker, MapPack, PackMap } from './pack';

export function markerSelectionBounds(map: PackMap, ids: ReadonlySet<string>) {
    const group = map.markers.filter((marker) => ids.has(marker.id));
    if (!group.length) return undefined;
    const xs = group.map((marker) => marker.x);
    const ys = group.map((marker) => marker.y);
    const left = Math.min(...xs),
        right = Math.max(...xs);
    const top = Math.min(...ys),
        bottom = Math.max(...ys);
    return { left, right, top, bottom };
}

export type ResizeDirection = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

export function positionTransferredMarkers(
    markers: readonly MapMarker[],
    destination: Pick<PackMap, 'width' | 'height'>,
    x: number,
    y: number,
): MapMarker[] {
    if (!markers.length) return [];
    const left = Math.min(...markers.map((marker) => marker.x));
    const right = Math.max(...markers.map((marker) => marker.x));
    const top = Math.min(...markers.map((marker) => marker.y));
    const bottom = Math.max(...markers.map((marker) => marker.y));
    const width = right - left;
    const height = bottom - top;
    const scale = Math.min(
        1,
        width ? destination.width / width : 1,
        height ? destination.height / height : 1,
    );
    const originX = Math.max(
        0,
        Math.min(x - (width * scale) / 2, destination.width - width * scale),
    );
    const originY = Math.max(
        0,
        Math.min(y - (height * scale) / 2, destination.height - height * scale),
    );
    return markers.map((marker) => ({
        ...marker,
        x: Math.min(destination.width, originX + (marker.x - left) * scale),
        y: Math.min(destination.height, originY + (marker.y - top) * scale),
    }));
}

export function transformMarkers(
    map: PackMap,
    ids: ReadonlySet<string>,
    dx: number,
    dy: number,
    resize?: ResizeDirection,
): PackMap {
    const bounds = markerSelectionBounds(map, ids);
    if (!bounds) return map;
    const { left, right, top, bottom } = bounds;
    const clamp = (value: number, low: number, high: number) =>
        Math.max(low, Math.min(high, value));
    const axis = (
        start: number,
        end: number,
        limit: number,
        delta: number,
        edge?: number,
    ) => {
        if (edge === undefined)
            return {
                origin: start + clamp(delta, -start, limit - end),
                scale: 1,
            };
        const span = end - start;
        if (!edge || !span) return { origin: start, scale: 1 };
        const min = Math.min(1, span);
        const low = edge < 0 ? clamp(start + delta, 0, end - min) : start;
        const high = edge > 0 ? clamp(end + delta, start + min, limit) : end;
        return { origin: low, scale: (high - low) / span };
    };
    const x = axis(left, right, map.width, dx, resize?.x);
    const y = axis(top, bottom, map.height, dy, resize?.y);
    const markers = map.markers.map((marker) => {
        if (!ids.has(marker.id)) return marker;
        const nextX = x.origin + (marker.x - left) * x.scale;
        const nextY = y.origin + (marker.y - top) * y.scale;
        return nextX === marker.x && nextY === marker.y
            ? marker
            : { ...marker, x: nextX, y: nextY };
    });
    return markers.some((marker, index) => marker !== map.markers[index])
        ? { ...map, markers }
        : map;
}

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
    includeGameChild?: (marker: MapLink) => boolean,
): string[] {
    const visited = new Set<string>();
    const checks = new Set<string>();
    const visit = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        for (const marker of pack.maps.find((map) => map.id === id)?.markers ??
            []) {
            if (marker.kind === 'checks') {
                for (const check of marker.checkIds) checks.add(check);
            } else if (
                marker.navigation === 'child' &&
                marker.targetMapId &&
                (!marker.exitId || includeGameChild?.(marker))
            )
                visit(marker.targetMapId);
        }
    };
    visit(mapId);
    return [...checks];
}
