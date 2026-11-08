// @vitest-environment node
import yaml from 'js-yaml';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyBokoblinBasePotRequirements } from './sshdWorldFeatures.mjs';

function fixture() {
    return yaml.load(fs.readFileSync('testData/sshd-dump.yaml', 'utf8'));
}

describe('post-Fire-Dragon pot generation', () => {
    it('adds the gate to exactly 36 pots and preserves other requirements and data', () => {
        const dump = fixture();
        const selected = new Set();
        for (const [area, first, last] of [
            ['Bokoblin Base Summit', 1, 12],
            ['Bokoblin Base Upper Eldin Cave', 13, 24],
            ['Bokoblin Base Prison', 19, 30],
        ]) {
            for (let number = first; number <= last; number++) {
                const name = `${area} - Pot ${number}`;
                dump.areas.sub_areas.Eldin.sub_areas[area].locations[name] =
                    'True';
                selected.add(name);
            }
        }
        const prison =
            dump.areas.sub_areas.Eldin.sub_areas['Bokoblin Base Prison'];
        prison.locations['Bokoblin Base Prison - Pot 19'] =
            '\\Mogma Mitts | Clawshots';
        const expected = structuredClone(dump);
        for (const area of Object.values(
            expected.areas.sub_areas.Eldin.sub_areas,
        )) {
            for (const [name, requirement] of Object.entries(
                area.locations ?? {},
            )) {
                if (selected.has(name)) {
                    area.locations[name] =
                        requirement === 'True'
                            ? '\\Beaten Boko Base'
                            : `(${requirement}) & \\Beaten Boko Base`;
                }
            }
        }
        applyBokoblinBasePotRequirements(dump);
        expect(selected.size).toBe(36);
        expect(dump).toEqual(expected);
    });

    it('reports missing target pots instead of silently losing a correction', () => {
        const dump = fixture();
        delete dump.areas.sub_areas.Eldin.sub_areas['Bokoblin Base Summit']
            .locations['Bokoblin Base Summit - Pot 1'];
        expect(() => applyBokoblinBasePotRequirements(dump)).toThrow(
            'Missing post-Fire-Dragon pot: Bokoblin Base Summit - Pot 1',
        );
    });
});
