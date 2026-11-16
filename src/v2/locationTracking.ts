import type { PlayerLocation } from '../archipelago/TrackerTelemetry';
import { validStage } from '../archipelago/TrackerTelemetry';
import type { MapPack } from './pack';

export type LocationRule = PlayerLocation;
export function validLocationRule(value: unknown): value is LocationRule {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const rule = value as Record<string, unknown>;
    return (
        validStage(rule.stage) &&
        ['room', 'layer', 'entrance'].every(
            (key) =>
                rule[key] === undefined ||
                (Number.isInteger(rule[key]) &&
                    Number(rule[key]) >= 0 &&
                    Number(rule[key]) <= 65535),
        )
    );
}
export function locationRuleKey(rule: LocationRule): string {
    return JSON.stringify([
        rule.stage,
        rule.room ?? null,
        rule.layer ?? null,
        rule.entrance ?? null,
    ]);
}
export function matchPlayerMap(
    pack: MapPack,
    location?: PlayerLocation,
): {
    mapId?: string;
    reason: 'waiting' | 'matched' | 'unmapped' | 'ambiguous';
} {
    if (!location) return { reason: 'waiting' };
    let best = -1;
    const candidates = new Set<string>();
    for (const map of pack.maps)
        for (const rule of map.trackingRules ?? []) {
            if (rule.stage !== location.stage) continue;
            const fields = ['room', 'layer', 'entrance'] as const;
            if (
                fields.some(
                    (key) =>
                        rule[key] !== undefined && rule[key] !== location[key],
                )
            )
                continue;
            const specificity = fields.filter(
                (key) => rule[key] !== undefined,
            ).length;
            if (specificity > best) {
                candidates.clear();
                best = specificity;
            }
            if (specificity === best) candidates.add(map.id);
        }
    if (!candidates.size) return { reason: 'unmapped' };
    if (candidates.size > 1) return { reason: 'ambiguous' };
    return { reason: 'matched', mapId: [...candidates][0] };
}
