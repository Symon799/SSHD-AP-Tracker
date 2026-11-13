import { describe, expect, it } from 'vitest';
import { groupVegetation, type VegetationEntry } from './VegetationGroups';

const entries: VegetationEntry[] = [
    {
        id: 'a',
        name: 'Central Skyloft - Grass Patch 1 - Blade 1',
        type: 'grass_blade',
        checked: true,
        accessible: true,
    },
    {
        id: 'b',
        name: 'Central Skyloft - Grass Patch 1 - Blade 2',
        type: 'grass_blade',
        checked: false,
        accessible: true,
    },
    {
        id: 'c',
        name: 'Central Skyloft - Grass Patch 2 - Blade 1',
        type: 'grass_blade',
        checked: false,
        accessible: false,
    },
    {
        id: 'tree',
        name: 'Central Skyloft - Tree 1',
        type: 'tree',
        checked: false,
        accessible: true,
    },
];

describe('vegetation groups', () => {
    it('groups blades by patch without merging their identities', () => {
        const groups = groupVegetation(entries, 'all');
        expect(groups.map((group) => group.type)).toEqual([
            'grass_blade',
            'tree',
        ]);
        expect(
            groups[0].patches
                .get('Central Skyloft - Grass Patch 1')
                ?.map((entry) => entry.id),
        ).toEqual(['a', 'b']);
        expect(groups[0].visible).toHaveLength(3);
    });
    it.each([
        ['accessible', ['b']],
        ['checked', ['a']],
    ] as const)(
        'applies %s without changing total counters',
        (filter, visible) => {
            const group = groupVegetation(entries, filter)[0];
            expect(group.all).toHaveLength(3);
            expect(group.visible.map((entry) => entry.id)).toEqual(visible);
        },
    );
});
