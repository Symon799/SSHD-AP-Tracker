import type { EntranceDiscovery } from '../archipelago/TrackerTelemetry';
import type { EntrancePool } from '../logic/Entrances';
import type { ExitMapping } from '../logic/Locations';

export function reviewDiscovery(
    entry: EntranceDiscovery,
    all: EntranceDiscovery[],
    exits: Record<string, ExitMapping>,
    pools: Record<string, EntrancePool>,
) {
    const exit = exits[entry.exit];
    if (!exit) return 'Unknown exit';
    if (exit.entrance?.id === entry.entrance) return 'Already mapped';
    if (!exit.canAssign) return 'Read-only connection';
    if (exit.entrance) return 'Conflict with current mapping';
    const pool = pools[exit.rule.pool];
    if (!pool?.entrances.some((arrival) => arrival.id === entry.entrance))
        return 'Invalid destination for this pool';
    if (
        pool.usedEntrancesExcluded &&
        (Object.values(exits).some(
            (other) =>
                other.exit.id !== entry.exit &&
                other.canAssign &&
                other.entrance?.id === entry.entrance,
        ) ||
            all.some(
                (other) =>
                    other.exit !== entry.exit &&
                    other.entrance === entry.entrance,
            ))
    )
        return 'Destination already used or conflicting discoveries';
    return 'Ready';
}
