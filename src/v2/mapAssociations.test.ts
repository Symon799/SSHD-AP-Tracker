import { expect, it } from 'vitest';
import {
    applyMapAssociations,
    associationSignature,
    associationTransfers,
} from './mapAssociations';
import type { MapPack } from './pack';

const pack: MapPack = {
    version: 1,
    id: 'test',
    name: 'Test',
    maps: [
        {
            id: 'a',
            name: 'Province',
            image: 'images/map.png',
            width: 100,
            height: 100,
            markers: [],
            entranceIds: ['door'],
            trackingRules: [{ stage: 'F100' }],
        },
        {
            id: 'b',
            name: 'Woods',
            image: 'images/map.png',
            width: 100,
            height: 100,
            markers: [],
            entranceIds: [],
            trackingRules: [],
        },
    ],
};
it('detects association changes independently of order without mutating drafts', () => {
    const rules = [{ stage: 'F200' }, { stage: 'F100', room: 1 }];
    const arrivals = ['second', 'first'];
    const signature = associationSignature(rules, arrivals);
    expect(signature).toBe(
        associationSignature([...rules].reverse(), [...arrivals].reverse()),
    );
    expect(signature).not.toBe(
        associationSignature(
            [{ stage: 'F200' }, { stage: 'F100', room: 2 }],
            arrivals,
        ),
    );
    expect(signature).not.toBe(associationSignature(rules, ['first']));
    expect(arrivals).toEqual(['second', 'first']);
    expect(rules[0].stage).toBe('F200');
});
it('requires consent to transfer ownership and updates all maps atomically', () => {
    expect(
        associationTransfers(pack, 'b', [{ stage: 'F100' }], ['door']),
    ).toHaveLength(2);
    expect(() =>
        applyMapAssociations(pack, 'b', [{ stage: 'F100' }], ['door'], false),
    ).toThrow('Confirm');
    const result = applyMapAssociations(
        pack,
        'b',
        [{ stage: 'F100' }],
        ['door'],
        true,
    );
    expect(result.maps[0].trackingRules).toEqual([]);
    expect(result.maps[0].entranceIds).toEqual([]);
    expect(result.maps[1].trackingRules).toEqual([{ stage: 'F100' }]);
    expect(pack.maps[0].entranceIds).toEqual(['door']);
});
it('retains broad fallbacks when adding a more specific room rule', () => {
    const result = applyMapAssociations(
        pack,
        'b',
        [{ stage: 'F100', room: 1 }],
        [],
        false,
    );
    expect(result.maps[0].trackingRules).toEqual([{ stage: 'F100' }]);
    expect(result.maps[1].trackingRules).toEqual([{ stage: 'F100', room: 1 }]);
});
it('rejects invalid conditions without modifying the source pack', () => {
    expect(() =>
        applyMapAssociations(
            pack,
            'b',
            [{ stage: 'F100', room: -1 }],
            [],
            false,
        ),
    ).toThrow();
    expect(() =>
        applyMapAssociations(pack, 'missing', [], [], false),
    ).toThrow();
});
