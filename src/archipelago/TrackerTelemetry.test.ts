import { describe, expect, it } from 'vitest';
import {
    parseTrackerTelemetry,
    TrackerTelemetryStore,
} from './TrackerTelemetry';
const session = { server: 'local', seed: 'test', team: 0, slot: 1 };
const frame = (sequence = 1) => ({
    version: 1,
    seed: 'test',
    team: 0,
    slot: 1,
    sequence,
    location: { stage: 'F100', room: 0 },
});
describe('Proposed tracker telemetry contract', () => {
    it('validates explicit seed/team/slot identity and rejects unqualified legacy data', () => {
        expect(parseTrackerTelemetry(frame(), session)?.location).toEqual({
            stage: 'F100',
            room: 0,
        });
        for (const data of [
            { ...frame(), slot: 2 },
            { ...frame(), team: 1 },
            { ...frame(), seed: 'other' },
            { ss_stage_name: 'F100' },
            null,
        ])
            expect(parseTrackerTelemetry(data, session)).toBeUndefined();
    });
    it('rejects malformed, oversized and conflicting messages', () => {
        for (const data of [
            { ...frame(), version: 2 },
            { ...frame(), sequence: -1 },
            { ...frame(), location: { stage: '', room: 0 } },
            { ...frame(), location: { stage: 'F100', room: '1' } },
            { ...frame(), location: { stage: 'F100', layer: -1 } },
            { ...frame(), location: { stage: 'F100', loading: 'yes' } },
            {
                ...frame(),
                discoveries: [
                    { exit: 'x', entrance: 'a' },
                    { exit: 'x', entrance: 'b' },
                ],
            },
            {
                ...frame(),
                discoveries: Array(2001).fill({ exit: 'x', entrance: 'a' }),
            },
        ])
            expect(parseTrackerTelemetry(data, session)).toBeUndefined();
    });
    it('keeps stable snapshots, ignores stale frames and does not count repeated locations as movement', () => {
        const store = new TrackerTelemetryStore();
        store.reset(session);
        expect(store.getSnapshot()).toBe(store.getSnapshot());
        store.receive(frame());
        expect(store.getSnapshot().locationRevision).toBe(1);
        store.receive(frame(2));
        expect(store.getSnapshot().locationRevision).toBe(1);
        store.receive({ ...frame(1), location: { stage: 'F200' } });
        expect(store.getSnapshot().location?.stage).toBe('F100');
    });
    it('holds the last valid location during loading and resets on disconnection or another session', () => {
        const store = new TrackerTelemetryStore();
        store.reset(session);
        store.receive(frame());
        store.receive({
            ...frame(2),
            location: { stage: 'F200', loading: true },
        });
        expect(store.getSnapshot().state).toBe('loading');
        expect(store.getSnapshot().location?.stage).toBe('F100');
        store.receive({ ...frame(3), slot: 2, location: { stage: 'F300' } });
        expect(store.getSnapshot().location?.stage).toBe('F100');
        store.reset();
        expect(store.getSnapshot().location).toBeUndefined();
        expect(store.getSnapshot().discoveries).toEqual([]);
    });
    it('buffers discoveries without applying them, supports combined frames and unsubscribe', () => {
        const store = new TrackerTelemetryStore();
        store.reset(session);
        let updates = 0;
        const unsubscribe = store.subscribe(() => updates++);
        store.receive({
            ...frame(),
            discoveries: [{ exit: 'door', entrance: 'arrival' }],
        });
        expect(store.getSnapshot().discoveries).toEqual([
            { exit: 'door', entrance: 'arrival' },
        ]);
        expect(updates).toBe(1);
        unsubscribe();
        store.receive({
            ...frame(2),
            discoveries: [{ exit: 'door', entrance: 'second' }],
        });
        expect(updates).toBe(1);
        expect(store.getSnapshot().discoveries).toEqual([
            { exit: 'door', entrance: 'second' },
        ]);
    });
});
