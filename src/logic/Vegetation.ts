import type { OptionValue } from '../permalink/SettingsTypes';
import type { LogicalCheck } from './Logic';
import type { RawArea, RawLogic } from './UpstreamTypes';

export type VegetationType = 'grass' | 'grass_blade' | 'tree';

export function isVegetationType(type: string): type is VegetationType {
    return type === 'grass' || type === 'grass_blade' || type === 'tree';
}

export function isVegetationEnabled(
    type: LogicalCheck['type'],
    settings: Record<string, OptionValue | undefined>,
) {
    if (type === 'grass') return settings['grass-shuffle'] === 'bundles';
    if (type === 'grass_blade') return settings['grass-shuffle'] === 'blades';
    if (type === 'tree') return settings['tree-shuffle'] === 'on';
    return true;
}

/** Share reachability only; AP identity and checked state remain per location. */
export function vegetationAccessAliases(raw: RawLogic): Record<string, string> {
    const accesses = new Map<string, [string, string][]>();
    const visit = (area: RawArea) => {
        for (const [key, requirement] of Object.entries(area.locations ?? {})) {
            const id = raw.checks[key] ? key : `${area.name}\\${key}`;
            if (
                ![
                    'Grass, Custom Flag',
                    'Grass Blade, Custom Flag',
                    'Trees, Custom Flag',
                ].includes(raw.checks[id]?.type ?? '')
            )
                continue;
            const paths = accesses.get(id) ?? [];
            paths.push([area.name, requirement]);
            accesses.set(id, paths);
        }
        Object.values(area.sub_areas).forEach(visit);
    };
    visit(raw.areas);
    const representatives = new Map<string, string>();
    const aliases: Record<string, string> = {};
    for (const [id, paths] of accesses) {
        const signature = JSON.stringify(paths);
        const representative = representatives.get(signature);
        if (representative) aliases[id] = representative;
        else representatives.set(signature, id);
    }
    return aliases;
}
