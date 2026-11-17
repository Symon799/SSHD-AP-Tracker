import {
    locationRuleKey,
    validLocationRule,
    type LocationRule,
} from './locationTracking';
import { parsePack, type MapPack } from './pack';

export function associationSignature(
    rules: LocationRule[],
    arrivals: string[],
) {
    return JSON.stringify([
        rules.map(locationRuleKey).sort((a, b) => a.localeCompare(b)),
        [...arrivals].sort((a, b) => a.localeCompare(b)),
    ]);
}

export function associationTransfers(
    pack: MapPack,
    mapId: string,
    rules: LocationRule[],
    arrivals: string[],
) {
    const keys = new Set(rules.map(locationRuleKey));
    return pack.maps
        .filter((map) => map.id !== mapId)
        .flatMap((map) => [
            ...(map.trackingRules ?? [])
                .filter((rule) => keys.has(locationRuleKey(rule)))
                .map((rule) => ({
                    kind: 'area' as const,
                    id: rule.stage,
                    from: map.name,
                    key: locationRuleKey(rule),
                })),
            ...map.entranceIds
                .filter((id) => arrivals.includes(id))
                .map((id) => ({
                    kind: 'entrance' as const,
                    id,
                    from: map.name,
                    key: id,
                })),
        ]);
}

export function applyMapAssociations(
    pack: MapPack,
    mapId: string,
    rules: LocationRule[],
    arrivals: string[],
    allowTransfers: boolean,
) {
    if (
        !pack.maps.some((map) => map.id === mapId) ||
        !rules.every(validLocationRule)
    )
        throw new Error('Invalid map associations.');
    if (
        !allowTransfers &&
        associationTransfers(pack, mapId, rules, arrivals).length
    )
        throw new Error('Confirm association transfers first.');
    const keys = new Set(rules.map(locationRuleKey));
    return parsePack({
        ...pack,
        maps: pack.maps.map((map) =>
            map.id === mapId
                ? { ...map, trackingRules: rules, entranceIds: arrivals }
                : {
                      ...map,
                      trackingRules: (map.trackingRules ?? []).filter(
                          (rule) => !keys.has(locationRuleKey(rule)),
                      ),
                      entranceIds: map.entranceIds.filter(
                          (id) => !arrivals.includes(id),
                      ),
                  },
        ),
    });
}
