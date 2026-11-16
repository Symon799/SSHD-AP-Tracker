import { describe, expect, it } from 'vitest';
import type { EntrancePool } from '../logic/Entrances';
import type { ExitMapping } from '../logic/Locations';
import { reviewDiscovery } from './entranceDiscoveries';
const entry = { exit: 'door', entrance: 'arrival' };
const pool: Record<string, EntrancePool> = {
    pool: {
        entrances: [{ id: 'arrival', name: 'Arrival' }],
        usedEntrancesExcluded: true,
    },
};
const exit = (id: string, arrival?: string): ExitMapping => ({
    exit: { id, name: id },
    canAssign: true,
    rule: { type: 'random', pool: 'pool' },
    entrance: arrival
        ? { id: arrival, name: arrival, region: 'Region' }
        : undefined,
});
describe('Entrance discovery review', () => {
    it('accepts compatible new choices without changing any manual state', () => {
        const exits = { door: exit('door') };
        expect(reviewDiscovery(entry, [entry], exits, pool)).toBe('Ready');
        expect(exits.door.entrance).toBeUndefined();
    });
    it('preserves known and conflicting manual choices', () => {
        expect(
            reviewDiscovery(
                entry,
                [entry],
                { door: exit('door', 'arrival') },
                pool,
            ),
        ).toBe('Already mapped');
        expect(
            reviewDiscovery(
                entry,
                [entry],
                { door: exit('door', 'other') },
                pool,
            ),
        ).toBe('Conflict with current mapping');
    });
    it('rejects unknown exits, read-only connections and incorrect pools', () => {
        expect(reviewDiscovery(entry, [entry], {}, pool)).toBe('Unknown exit');
        expect(
            reviewDiscovery(
                entry,
                [entry],
                {
                    door: {
                        ...exit('door'),
                        canAssign: false,
                        rule: { type: 'vanilla' },
                    },
                },
                pool,
            ),
        ).toBe('Read-only connection');
        expect(
            reviewDiscovery(
                { ...entry, entrance: 'other' },
                [entry],
                { door: exit('door') },
                pool,
            ),
        ).toBe('Invalid destination for this pool');
    });
    it('rejects duplicate targets in exclusive pools and already-used arrivals', () => {
        expect(
            reviewDiscovery(
                entry,
                [entry, { ...entry, exit: 'second' }],
                { door: exit('door') },
                pool,
            ),
        ).toContain('Destination already used');
        expect(
            reviewDiscovery(
                entry,
                [entry],
                { door: exit('door'), second: exit('second', 'arrival') },
                pool,
            ),
        ).toContain('Destination already used');
    });
});
