import { describe, expect, it } from 'vitest';
import reducer, {
    clickItem,
    createResetTrackerState,
    replaceItemCounts,
} from './Slice';

describe('tracker inventory overrides', () => {
    it('stores manual corrections as deltas until AP catches up from zero', () => {
        let state = createResetTrackerState({} as never);

        state = reducer(
            state,
            replaceItemCounts([
                { item: 'Skyview Small Key', count: 0 },
                { item: 'Skyview Boss Key', count: 0 },
            ]),
        );

        state = reducer(
            state,
            clickItem({ item: 'Skyview Boss Key', take: false }),
        );
        expect(state.inventory['Skyview Boss Key']).toBe(1);
        expect(state.manualInventoryOverrides['Skyview Boss Key']).toBe(1);

        state = reducer(
            state,
            replaceItemCounts([
                { item: 'Skyview Small Key', count: 1 },
                { item: 'Skyview Boss Key', count: 1 },
            ]),
        );
        expect(state.inventory['Skyview Small Key']).toBe(1);
        expect(state.inventory['Skyview Boss Key']).toBe(1);
        expect(
            state.manualInventoryOverrides['Skyview Boss Key'],
        ).toBeUndefined();

        state = reducer(
            state,
            replaceItemCounts([
                { item: 'Skyview Small Key', count: 1 },
                { item: 'Skyview Boss Key', count: 0 },
            ]),
        );
        expect(state.inventory['Skyview Boss Key']).toBe(0);
        expect(
            state.manualInventoryOverrides['Skyview Boss Key'],
        ).toBeUndefined();
    });

    it('keeps a positive delta when AP increments from a non-zero count', () => {
        let state = createResetTrackerState({} as never);

        state = reducer(
            state,
            replaceItemCounts([{ item: 'Progressive Sword', count: 2 }]),
        );
        state = reducer(
            state,
            clickItem({ item: 'Progressive Sword', take: false }),
        );
        expect(state.inventory['Progressive Sword']).toBe(3);
        expect(state.manualInventoryOverrides['Progressive Sword']).toBe(1);

        state = reducer(
            state,
            replaceItemCounts([{ item: 'Progressive Sword', count: 3 }]),
        );
        expect(state.inventory['Progressive Sword']).toBe(4);
        expect(state.manualInventoryOverrides['Progressive Sword']).toBe(1);
    });

    it('applies a negative delta through AP increments', () => {
        let state = createResetTrackerState({} as never);

        state = reducer(
            state,
            replaceItemCounts([{ item: 'Progressive Sword', count: 1 }]),
        );
        state = reducer(
            state,
            clickItem({ item: 'Progressive Sword', take: true }),
        );
        expect(state.inventory['Progressive Sword']).toBe(0);
        expect(state.manualInventoryOverrides['Progressive Sword']).toBe(-1);

        state = reducer(
            state,
            replaceItemCounts([{ item: 'Progressive Sword', count: 2 }]),
        );
        expect(state.inventory['Progressive Sword']).toBe(1);
        expect(state.manualInventoryOverrides['Progressive Sword']).toBe(-1);
    });

    it('clamps manual counts between zero and the item maximum', () => {
        let state = createResetTrackerState({} as never);

        state = reducer(
            state,
            clickItem({ item: 'Skyview Boss Key', take: false }),
        );
        expect(state.inventory['Skyview Boss Key']).toBe(1);
        state = reducer(
            state,
            clickItem({ item: 'Skyview Boss Key', take: true }),
        );
        expect(state.inventory['Skyview Boss Key'] ?? 0).toBe(0);

        state = reducer(state, clickItem({ item: 'Key Piece', take: false }));
        for (let i = 0; i < 10; i++) {
            state = reducer(
                state,
                clickItem({ item: 'Key Piece', take: false }),
            );
        }
        expect(state.inventory['Key Piece']).toBe(5);
        expect(state.manualInventoryOverrides['Key Piece']).toBe(5);
    });
});
