export interface PlayerLocation {
    stage: string;
    room?: number;
    layer?: number;
    entrance?: number;
}
export interface EntranceDiscovery {
    exit: string;
    entrance: string;
}
export interface TelemetrySession {
    server: string;
    seed: string;
    team: number;
    slot: number;
}
export interface TelemetrySnapshot {
    session?: TelemetrySession;
    location?: PlayerLocation;
    locationRevision: number;
    discoveries: EntranceDiscovery[];
    sequence: number;
    state: 'waiting' | 'ready' | 'loading';
    issue?: string;
}
const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, max = 65535): value is number =>
    Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;
const id = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 1000;
export const validStage = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value);

export const rustLocationKey = (seed: string, slot: number) =>
    `sshd_rs_${seed}_${slot}_tracker_location`;

export function parseRustLocation(value: unknown): PlayerLocation | undefined {
    if (
        !record(value) ||
        !validStage(value.stage) ||
        ['room', 'layer', 'entrance'].some(
            (key) =>
                value[key] !== undefined &&
                value[key] !== null &&
                !integer(value[key]),
        )
    )
        return undefined;
    return {
        stage: value.stage,
        ...(integer(value.room) ? { room: value.room } : {}),
        ...(integer(value.layer) ? { layer: value.layer } : {}),
        ...(integer(value.entrance) ? { entrance: value.entrance } : {}),
    };
}

/** Proposed protocol, not a claim that the SSHD client currently publishes it. */
export function parseTrackerTelemetry(
    value: unknown,
    session: TelemetrySession,
) {
    if (
        !record(value) ||
        value.version !== 1 ||
        value.seed !== session.seed ||
        value.team !== session.team ||
        value.slot !== session.slot ||
        !integer(value.sequence, Number.MAX_SAFE_INTEGER)
    )
        return undefined;
    let location: PlayerLocation | undefined;
    let loading = false;
    if (value.location !== undefined) {
        const source = value.location;
        if (
            !record(source) ||
            !validStage(source.stage) ||
            ['room', 'layer', 'entrance'].some(
                (field) =>
                    source[field] !== undefined && !integer(source[field]),
            ) ||
            (source.loading !== undefined &&
                typeof source.loading !== 'boolean')
        )
            return undefined;
        loading = source.loading === true;
        location = {
            stage: source.stage,
            ...(source.room !== undefined
                ? { room: source.room as number }
                : {}),
            ...(source.layer !== undefined
                ? { layer: source.layer as number }
                : {}),
            ...(source.entrance !== undefined
                ? { entrance: source.entrance as number }
                : {}),
        };
    }
    let discoveries: EntranceDiscovery[] = [];
    if (value.discoveries !== undefined) {
        if (
            !Array.isArray(value.discoveries) ||
            value.discoveries.length > 2000 ||
            value.discoveries.some(
                (entry) =>
                    !record(entry) || !id(entry.exit) || !id(entry.entrance),
            )
        )
            return undefined;
        discoveries = value.discoveries.map(
            (entry: Record<string, unknown>) => ({
                exit: entry.exit as string,
                entrance: entry.entrance as string,
            }),
        );
        if (
            new Set(discoveries.map((entry) => entry.exit)).size !==
            discoveries.length
        )
            return undefined;
    }
    if (!location && !value.discoveries) return undefined;
    return { sequence: value.sequence, location, loading, discoveries };
}

const empty = (): TelemetrySnapshot => ({
    locationRevision: 0,
    discoveries: [],
    sequence: -1,
    state: 'waiting',
});
export class TrackerTelemetryStore {
    private snapshot: TelemetrySnapshot = empty();
    private listeners = new Set<() => void>();
    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    private publish(next: TelemetrySnapshot) {
        this.snapshot = next;
        for (const listener of this.listeners) listener();
    }
    reset(session?: TelemetrySession) {
        this.publish({ ...empty(), session });
    }
    receiveRustLocation(key: string, value: unknown) {
        const session = this.snapshot.session;
        if (!session || key !== rustLocationKey(session.seed, session.slot))
            return;
        if (value === null) {
            if (this.snapshot.state === 'waiting' && !this.snapshot.location)
                return;
            this.publish({
                ...this.snapshot,
                location: undefined,
                state: 'waiting',
                issue: undefined,
            });
            return;
        }
        const location = parseRustLocation(value);
        if (!location) {
            this.publish({
                ...this.snapshot,
                issue: 'Ignored invalid Rust client location.',
            });
            return;
        }
        const changed =
            JSON.stringify(location) !== JSON.stringify(this.snapshot.location);
        if (!changed && this.snapshot.state === 'ready' && !this.snapshot.issue)
            return;
        this.publish({
            ...this.snapshot,
            location,
            state: 'ready',
            issue: undefined,
            locationRevision:
                this.snapshot.locationRevision + (changed ? 1 : 0),
        });
    }
    receive(value: unknown) {
        if (!this.snapshot.session) return;
        const message = parseTrackerTelemetry(value, this.snapshot.session);
        if (!message) {
            this.publish({
                ...this.snapshot,
                issue: 'Ignored invalid telemetry or data for another seed/player.',
            });
            return;
        }
        if (message.sequence <= this.snapshot.sequence) return;
        const location =
            message.location && !message.loading
                ? message.location
                : this.snapshot.location;
        const changed =
            JSON.stringify(location) !== JSON.stringify(this.snapshot.location);
        const discoveries = new Map(
            this.snapshot.discoveries.map((entry) => [entry.exit, entry]),
        );
        for (const entry of message.discoveries)
            discoveries.set(entry.exit, entry);
        if (discoveries.size > 2000) return;
        this.publish({
            ...this.snapshot,
            location,
            locationRevision:
                this.snapshot.locationRevision + (changed ? 1 : 0),
            discoveries: [...discoveries.values()],
            sequence: message.sequence,
            state: message.location
                ? message.loading
                    ? 'loading'
                    : 'ready'
                : this.snapshot.state,
            issue: undefined,
        });
    }
}
