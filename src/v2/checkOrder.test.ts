import { describe, expect, it } from 'vitest';
import type { LogicalCheck } from '../logic/Logic';
import { createV1CheckOrder } from './checkOrder';

const check = (type: LogicalCheck['type']): LogicalCheck => ({
    type,
    name: '',
    originalItem: undefined,
    area: 'Test',
});
const logic = {
    hintRegions: ['Test'],
    checksByHintRegion: {
        Test: [
            'z',
            'a',
            'grass2',
            'tree',
            'sign',
            'blade',
            'grass1',
            'cube',
            'stone',
        ],
    },
    checks: {
        z: check('regular'),
        a: check('regular'),
        grass2: check('grass'),
        tree: check('tree'),
        sign: check('sign'),
        blade: check('grass_blade'),
        grass1: check('grass'),
        cube: check('tr_cube'),
        stone: check('gossip_stone'),
    },
};

describe('V1 check display order', () => {
    it('uses logic order rather than alphabetic or placement order and keeps V1 category order', () => {
        const ids = Object.keys(logic.checks).reverse();
        const before = [...ids];
        expect(createV1CheckOrder(logic)(ids)).toEqual([
            'z',
            'a',
            'sign',
            'grass2',
            'grass1',
            'blade',
            'tree',
            'cube',
            'stone',
        ]);
        expect(ids).toEqual(before);
    });
    it('sorts subsets, removes repeated references and preserves unknown references', () => {
        expect(
            createV1CheckOrder(logic)(['a', 'z', 'a', 'unknown', 'another']),
        ).toEqual(['z', 'a', 'unknown', 'another']);
    });
});
