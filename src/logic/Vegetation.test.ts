import { load } from 'js-yaml';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RawLogic } from './UpstreamTypes';
import { vegetationAccessAliases } from './Vegetation';

describe('vegetation reachability sharing', () => {
    it('does not share access when an alternative path or requirement differs', () => {
        const raw = load(
            fs.readFileSync('testData/sshd-dump.yaml', 'utf8'),
        ) as RawLogic;
        const first =
            '\\Skyloft\\Central Skyloft\\Central Skyloft - Grass Patch 1 - Blade 1';
        const second =
            '\\Skyloft\\Central Skyloft\\Central Skyloft - Grass Patch 1 - Blade 2';
        const same = vegetationAccessAliases(raw);
        expect(same[first]).toBeDefined();
        expect(same[first]).toBe(same[second]);
        const central =
            raw.areas.sub_areas.Skyloft.sub_areas['Central Skyloft'];
        const key = 'Central Skyloft - Grass Patch 1 - Blade 2';
        const original = central.locations![key];
        raw.areas.sub_areas.Skyloft.sub_areas['Central Skyloft'].locations![
            'Central Skyloft - Grass Patch 1 - Blade 2'
        ] = 'Clawshots';
        const different = vegetationAccessAliases(raw);
        expect(different[first]).not.toBe(different[second]);
        central.locations![key] = original;
        raw.areas.sub_areas.Skyloft.sub_areas['Upper Skyloft'].locations![
            second
        ] = 'Bomb Bag';
        const extraPath = vegetationAccessAliases(raw);
        expect(extraPath[first]).not.toBe(extraPath[second]);
    });
});
