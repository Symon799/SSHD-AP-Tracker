import yaml from 'js-yaml';
import fs from 'node:fs';

const dump = yaml.load(fs.readFileSync('testData/sshd-dump.yaml', 'utf8'));
const types = new Set([
    'Grass, Custom Flag',
    'Grass Blade, Custom Flag',
    'Trees, Custom Flag',
]);
const entries = Object.values(dump.checks).filter((check) =>
    types.has(check.type),
);
export const vegetationLocations = Object.fromEntries(
    entries.map((check, index) => [check.short_name, 400000 + index]),
);

export function vegetationFixture(slot) {
    const mode =
        slot === 'Vegetation Player'
            ? 'bundles'
            : slot === 'Blade Player'
              ? 'blades'
              : undefined;
    if (!mode) return undefined;
    const active = entries.filter(
        (entry) =>
            entry.type === 'Trees, Custom Flag' ||
            entry.type ===
                (mode === 'bundles'
                    ? 'Grass, Custom Flag'
                    : 'Grass Blade, Custom Flag'),
    );
    const ids = active.map((entry) => vegetationLocations[entry.short_name]);
    const centralGrassIds = active
        .filter(
            (entry) =>
                entry.short_name.startsWith('Central Skyloft -') &&
                entry.type !== 'Trees, Custom Flag',
        )
        .map((entry) => vegetationLocations[entry.short_name]);
    const checked = [1001, ...centralGrassIds.slice(0, 7)];
    return { mode, ids, checked, centralGrassIds };
}
