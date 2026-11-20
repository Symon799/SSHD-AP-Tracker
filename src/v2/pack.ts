import {
    locationRuleKey,
    validLocationRule,
    type LocationRule,
} from './locationTracking';

export interface CheckMarker {
    id: string;
    kind: 'checks';
    label: string;
    x: number;
    y: number;
    checkIds: string[];
    note?: string;
    showNameOnHover?: boolean;
}

export interface MapLink {
    id: string;
    kind: 'link';
    label: string;
    x: number;
    y: number;
    targetMapId?: string;
    exitId?: string;
    navigation?: 'child' | 'back';
}

export type MapMarker = CheckMarker | MapLink;

export interface PackMap {
    id: string;
    name: string;
    image: string;
    width: number;
    height: number;
    entranceIds: string[];
    markers: MapMarker[];
    trackingRules?: LocationRule[];
}

export interface MapPack {
    version: 1;
    id: string;
    name: string;
    maps: PackMap[];
    checkEras?: Record<string, CheckEra>;
}

export type CheckEra = 'past' | 'present';

export interface MapDocument {
    pack: MapPack;
    images: Record<string, string>;
    /** Local editing identity; excluded from exported pack.json. */
    draftRevision?: string;
}

export const assetPath = (path: string) =>
    /^images\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/.test(path);
const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
const text = (value: unknown): value is string =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 1000;
const identifier = (value: unknown): value is string =>
    typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const strings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(text);

/** Pack files contain presentation data only, never executable logic or seed state. */
export function parsePack(input: unknown): MapPack {
    assert(
        record(input) && input.version === 1,
        'Unsupported map pack version. Expected version 1.',
    );
    assert(
        identifier(input.id) && text(input.name),
        'Invalid pack id or name.',
    );
    assert(
        Array.isArray(input.maps) &&
            input.maps.length > 0 &&
            input.maps.length <= 200,
        'A pack must contain 1–200 maps.',
    );
    const maps: PackMap[] = input.maps.map((value: unknown) => {
        assert(
            record(value) && identifier(value.id) && text(value.name),
            'Invalid map id or name.',
        );
        assert(
            typeof value.image === 'string' && assetPath(value.image),
            `Invalid image path for ${value.name}.`,
        );
        const { width, height } = value;
        assert(
            typeof width === 'number' &&
                typeof height === 'number' &&
                Number.isFinite(width) &&
                Number.isFinite(height) &&
                width > 0 &&
                height > 0 &&
                width <= 16384 &&
                height <= 16384,
            `Invalid dimensions for ${value.name}.`,
        );
        assert(
            strings(value.entranceIds),
            `Invalid entrance list for ${value.name}.`,
        );
        assert(
            value.trackingRules === undefined ||
                (Array.isArray(value.trackingRules) &&
                    value.trackingRules.length <= 200 &&
                    value.trackingRules.every(validLocationRule)),
            `Invalid player tracking rules for ${value.name}.`,
        );
        assert(
            Array.isArray(value.markers) && value.markers.length <= 2000,
            `Invalid marker list for ${value.name}.`,
        );
        const markers: MapMarker[] = value.markers.map((marker: unknown) => {
            assert(
                record(marker) && identifier(marker.id) && text(marker.label),
                'Invalid marker id or label.',
            );
            const { x, y } = marker;
            assert(
                typeof x === 'number' &&
                    typeof y === 'number' &&
                    Number.isFinite(x) &&
                    Number.isFinite(y) &&
                    x >= 0 &&
                    y >= 0 &&
                    x <= width &&
                    y <= height,
                `Marker ${marker.label} is outside its map.`,
            );
            const common = { id: marker.id, label: marker.label, x, y };
            if (marker.kind === 'checks') {
                assert(
                    strings(marker.checkIds) &&
                        marker.checkIds.length > 0 &&
                        marker.checkIds.length <= 50000,
                    `Marker ${marker.label} needs check references.`,
                );
                assert(
                    new Set(marker.checkIds).size === marker.checkIds.length,
                    'Duplicate check references in a group.',
                );
                assert(
                    marker.note === undefined ||
                        (typeof marker.note === 'string' &&
                            marker.note.length <= 4000),
                    'Invalid marker note.',
                );
                assert(
                    marker.showNameOnHover === undefined ||
                        typeof marker.showNameOnHover === 'boolean',
                    'Invalid hover title setting.',
                );
                return {
                    ...common,
                    kind: 'checks',
                    checkIds: marker.checkIds,
                    ...(marker.note ? { note: marker.note } : {}),
                    ...(marker.showNameOnHover !== undefined
                        ? { showNameOnHover: marker.showNameOnHover }
                        : {}),
                };
            }
            assert(marker.kind === 'link', 'Unknown marker kind.');
            assert(
                marker.navigation === undefined ||
                    marker.navigation === 'child' ||
                    marker.navigation === 'back',
                'Invalid navigation role.',
            );
            assert(
                marker.targetMapId === undefined ||
                    identifier(marker.targetMapId),
                'Invalid destination map.',
            );
            assert(
                marker.exitId === undefined || text(marker.exitId),
                'Invalid exit reference.',
            );
            assert(
                marker.targetMapId || marker.exitId,
                `Link ${marker.label} needs a destination or randomized exit.`,
            );
            return {
                ...common,
                kind: 'link',
                ...(marker.targetMapId
                    ? { targetMapId: marker.targetMapId }
                    : {}),
                ...(marker.exitId ? { exitId: marker.exitId } : {}),
                ...(marker.navigation ? { navigation: marker.navigation } : {}),
            };
        });
        assert(
            new Set(markers.map((marker) => marker.id)).size === markers.length,
            `Duplicate marker ids in ${value.name}.`,
        );
        return {
            id: value.id,
            name: value.name,
            image: value.image,
            width,
            height,
            entranceIds: value.entranceIds,
            markers,
            ...(value.trackingRules !== undefined
                ? { trackingRules: value.trackingRules }
                : {}),
        };
    });
    assert(
        new Set(maps.map((map) => map.id)).size === maps.length,
        'Duplicate map ids.',
    );
    const entrances = maps.flatMap((map) => map.entranceIds);
    const trackingRules = maps.flatMap((map) =>
        (map.trackingRules ?? []).map(locationRuleKey),
    );
    assert(
        new Set(trackingRules).size === trackingRules.length,
        'The same player tracking rule is assigned more than once.',
    );
    assert(
        new Set(entrances).size === entrances.length,
        'An entrance is assigned to multiple maps.',
    );
    for (const map of maps)
        for (const marker of map.markers) {
            if (marker.kind === 'link' && marker.targetMapId)
                assert(
                    maps.some(
                        (candidate) => candidate.id === marker.targetMapId,
                    ),
                    `Missing destination for ${marker.label}.`,
                );
        }
    const checkEras = input.checkEras;
    const eras: [string, CheckEra][] = [];
    if (checkEras !== undefined) {
        assert(record(checkEras), 'Invalid check timeline annotations.');
        for (const [id, era] of Object.entries(checkEras)) {
            assert(
                text(id) && (era === 'past' || era === 'present'),
                'Invalid check timeline annotations.',
            );
            eras.push([id, era]);
        }
    }
    return {
        version: 1,
        id: input.id,
        name: input.name,
        maps,
        ...(eras.length ? { checkEras: Object.fromEntries(eras) } : {}),
    };
}

export function checkEra(eras: MapPack['checkEras'], id: string) {
    return eras && Object.hasOwn(eras, id) ? eras[id] : undefined;
}

export function markerEra(eras: MapPack['checkEras'], ids: string[]) {
    const first = checkEra(eras, ids[0]);
    return first && ids.every((id) => checkEra(eras, id) === first)
        ? first
        : undefined;
}

export function placedChecks(pack: MapPack): Set<string> {
    return new Set(
        pack.maps.flatMap((map) =>
            map.markers.flatMap((marker) =>
                marker.kind === 'checks' ? marker.checkIds : [],
            ),
        ),
    );
}

/** Upgrade only the original V1 region groups; preserve custom groups and explicit choices. */
export function upgradeLegacyHoverTitles(pack: MapPack): MapPack {
    if (pack.id !== 'sshd-v2-v1-layout') return pack;
    let changed = false;
    const maps = pack.maps.map((map) => ({
        ...map,
        markers: map.markers.map((marker) => {
            if (
                marker.kind !== 'checks' ||
                marker.showNameOnHover !== undefined ||
                !/^(region-\d+|others)$/.test(marker.id)
            )
                return marker;
            changed = true;
            return { ...marker, showNameOnHover: true };
        }),
    }));
    return changed ? { ...pack, maps } : pack;
}

export function packWarnings(
    pack: MapPack,
    checks: Set<string>,
    exits: Set<string>,
    entrances: Set<string>,
): string[] {
    const warnings: string[] = [];
    for (const id of placedChecks(pack))
        if (!checks.has(id)) warnings.push(`Unknown check: ${id}`);
    for (const map of pack.maps) {
        for (const entrance of map.entranceIds)
            if (!entrances.has(entrance))
                warnings.push(`Unknown entrance: ${entrance}`);
        for (const marker of map.markers)
            if (
                marker.kind === 'link' &&
                marker.exitId &&
                !exits.has(marker.exitId)
            )
                warnings.push(`Unknown exit: ${marker.exitId}`);
    }
    return warnings;
}

export type MarkerStatus =
    | 'done'
    | 'available'
    | 'mixed'
    | 'unavailable'
    | 'empty';
export function summarizeChecks(
    ids: string[],
    active: Set<string>,
    checked: Set<string>,
    accessible: (id: string) => boolean,
) {
    const visible = [...new Set(ids)].filter((id) => active.has(id));
    const remaining = visible.filter((id) => !checked.has(id));
    const available = remaining.filter(accessible).length;
    const status: MarkerStatus = !visible.length
        ? 'empty'
        : !remaining.length
          ? 'done'
          : available === remaining.length
            ? 'available'
            : available
              ? 'mixed'
              : 'unavailable';
    return {
        total: visible.length,
        checked: visible.length - remaining.length,
        remaining: remaining.length,
        available,
        status,
    };
}

export function linkDestination(
    link: MapLink,
    pack: MapPack,
    mappedEntrance: string | undefined,
): string | undefined {
    // Never reveal the vanilla destination of an unknown randomized connection.
    return link.exitId
        ? pack.maps.find((map) =>
              map.entranceIds.includes(mappedEntrance ?? ''),
          )?.id
        : link.targetMapId;
}
