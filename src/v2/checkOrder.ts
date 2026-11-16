import type { Logic } from '../logic/Logic';

/** Match V1: regular checks in logic order, then vegetation groups and auxiliary checks. */
export function createV1CheckOrder(
    logic: Pick<Logic, 'checks' | 'checksByHintRegion' | 'hintRegions'>,
) {
    const ids = [
        ...new Set([
            ...logic.hintRegions.flatMap(
                (region) => logic.checksByHintRegion[region] ?? [],
            ),
            ...Object.keys(logic.checks),
        ]),
    ];
    const ranks = new Map(ids.map((id, index) => [id, index]));
    const sections: Record<string, number> = {
        sign: 1,
        grass: 2,
        grass_blade: 3,
        tree: 4,
        tr_cube: 5,
        gossip_stone: 6,
    };
    const section = (id: string) => sections[logic.checks[id]?.type] ?? 0;
    return (checks: readonly string[]) =>
        [...new Set(checks)].sort(
            (a, b) =>
                section(a) - section(b) ||
                (ranks.get(a) ?? Infinity) - (ranks.get(b) ?? Infinity),
        );
}
