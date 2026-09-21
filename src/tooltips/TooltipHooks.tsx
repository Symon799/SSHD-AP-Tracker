import {
    type ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    useSyncExternalStore,
} from 'react';
import { useSelector } from 'react-redux';
import {
    debugModeSelector,
    trickSemiLogicSelector,
    trickSemiLogicTrickListSelector,
} from '../customization/Selectors';
import { mergeRequirements } from '../logic/bitlogic/BitLogic';
import { formatEntranceName } from '../logic/Entrances';
import type { ExplorationNode } from '../logic/Pathfinding';
import { logicSelector, optionsSelector } from '../logic/Selectors';
import {
    checkSelector,
    exitsByIdSelector,
    getRequirementLogicalStateSelector,
    inLogicPathfindingSelector,
    optimisticPathfindingSelector,
    settingSelector,
    settingsRequirementsSelector,
    settingsSelector,
} from '../tracker/Selectors';
import { noop } from '../utils/Function';
import { TooltipComputer } from './TooltipComputations';
import {
    type RootTooltipExpression,
    booleanExprToTooltipExpr,
} from './TooltipExpression';

const TooltipsContext = createContext<TooltipComputer | null>(null);

/**
 * A context and cache for the tooltip expressions.
 */
export function MakeTooltipsAvailable({ children }: { children: ReactNode }) {
    const [analyzer, setAnalyzer] = useState<TooltipComputer | null>(null);

    const logic = useSelector(logicSelector);
    const options = useSelector(optionsSelector);
    const settings = useSelector(settingsSelector);
    const settingsRequirements = useSelector(settingsRequirementsSelector);
    const expertMode = useSelector(trickSemiLogicSelector);
    const consideredTricks = useSelector(trickSemiLogicTrickListSelector);

    useEffect(() => {
        const bitLogic = mergeRequirements(
            logic.numRequirements,
            logic.staticRequirements,
            settingsRequirements,
        );
        setAnalyzer(
            new TooltipComputer(
                logic,
                options,
                settings,
                expertMode,
                consideredTricks,
                bitLogic,
            ),
        );
        return () => {
            setAnalyzer((oldAnalyzer) => {
                oldAnalyzer?.destroy();
                return null;
            });
        };
    }, [
        settingsRequirements,
        logic,
        options,
        expertMode,
        consideredTricks,
        settings,
    ]);

    return <TooltipsContext value={analyzer}>{children}</TooltipsContext>;
}

/** Compute the tooltip expression for a given check. This will return undefined until results are available. */
export function useTooltipExpr(
    checkId: string,
    active = true,
): RootTooltipExpression | undefined {
    const store = useContext(TooltipsContext);
    const logic = useSelector(logicSelector);
    const getRequirementLogicalState = useSelector(
        getRequirementLogicalStateSelector,
    );

    const subscribe = useCallback(
        (callback: () => void) =>
            (active && store?.subscribe(checkId, callback)) || noop,
        [active, checkId, store],
    );
    const getSnapshot = useCallback(
        () => (active && store?.getSnapshot(checkId)) || undefined,
        [active, checkId, store],
    );
    const booleanExpr = useSyncExternalStore(subscribe, getSnapshot);

    return useMemo(
        () =>
            booleanExpr &&
            booleanExprToTooltipExpr(
                logic,
                booleanExpr,
                getRequirementLogicalState,
            ),
        [booleanExpr, logic, getRequirementLogicalState],
    );
}

export function useEntrancePath(checkId: string): string[] | undefined {
    const logicPathfinding = useSelector(inLogicPathfindingSelector);
    const optimisticPathfinding = useSelector(optimisticPathfindingSelector);
    const entranceRando = useSelector(settingSelector('randomize-entrances'));

    return useMemo(() => {
        if (entranceRando !== 'All') {
            return undefined;
        }

        const path =
            logicPathfinding?.[checkId] ?? optimisticPathfinding?.[checkId];
        if (!path) {
            return undefined;
        }
        const segments = [];
        let node: ExplorationNode | undefined = path;
        do {
            if (node.edge) {
                segments.push(node.edge);
            }
            node = node.parent;
        } while (node !== undefined);
        segments.push('Start');
        return segments.reverse();
    }, [checkId, entranceRando, logicPathfinding, optimisticPathfinding]);
}

export interface TooltipDebugInfo {
    checkId: string;
    checkName: string;
    logicalState: string;
    checkBit: number | undefined;
    rawStaticRequirements: string[];
    staticRequirements: string[];
    staticRequirementStates: string[];
    inLogicPathFound: boolean;
    optimisticPathFound: boolean;
    startEntrance: string | undefined;
    area: string | undefined;
    relevantExits: string[];
    entranceSettings: Record<string, string | boolean | undefined>;
}

function isImpossibleTooltip(requirements: RootTooltipExpression | undefined) {
    return (
        requirements?.items.length === 1 &&
        requirements.items[0]?.type === 'item' &&
        requirements.items[0].item === 'Impossible (discover an entrance first)'
    );
}

function summarizeStaticRequirements(
    logic: ReturnType<typeof logicSelector>,
    bit: number | undefined,
    useRaw = false,
) {
    if (bit === undefined) {
        return ['check bit missing'];
    }

    const expr = useRaw
        ? logic.rawStaticRequirements[bit]
        : logic.staticRequirements[bit];
    if (!expr || expr.conjunctions.length === 0) {
        return ['static requirements = false'];
    }

    const summaries = expr.conjunctions.slice(0, 3).map((conjunction) => {
        const parts = [...conjunction.iter()]
            .slice(0, 8)
            .map((reqBit) => logic.allItems[reqBit] ?? `bit:${reqBit}`);
        const suffix =
            conjunction.numSetBits > 8
                ? ` +${conjunction.numSetBits - 8} more`
                : '';
        return parts.length > 0 ? `${parts.join(' & ')}${suffix}` : 'true';
    });

    if (expr.conjunctions.length > 3) {
        summaries.push(`... ${expr.conjunctions.length - 3} other branches`);
    }
    return summaries;
}

function summarizeStaticRequirementStates(
    logic: ReturnType<typeof logicSelector>,
    bit: number | undefined,
    getRequirementLogicalState: (requirement: string) => string,
) {
    if (bit === undefined) {
        return ['check bit missing'];
    }

    const expr = logic.staticRequirements[bit];
    if (!expr || expr.conjunctions.length === 0) {
        return ['static requirements = false'];
    }

    return expr.conjunctions.slice(0, 3).map((conjunction, index) => {
        const parts = [...conjunction.iter()].slice(0, 8).map((reqBit) => {
            const requirement = logic.allItems[reqBit] ?? `bit:${reqBit}`;
            return `${requirement} [${getRequirementLogicalState(requirement)}]`;
        });
        const suffix =
            conjunction.numSetBits > 8
                ? ` +${conjunction.numSetBits - 8} more`
                : '';
        return `branch ${index + 1}: ${parts.join(' & ')}${suffix}`;
    });
}

export function useTooltipDebug(
    checkId: string,
    requirements: RootTooltipExpression | undefined,
): TooltipDebugInfo | undefined {
    const logic = useSelector(logicSelector);
    const check = useSelector(checkSelector(checkId));
    const exitsById = useSelector(exitsByIdSelector);
    const inLogicPathfinding = useSelector(inLogicPathfindingSelector);
    const optimisticPathfinding = useSelector(optimisticPathfindingSelector);
    const getRequirementLogicalState = useSelector(
        getRequirementLogicalStateSelector,
    );
    const settings = useSelector(settingsSelector);
    const debugMode = useSelector(debugModeSelector);

    return useMemo(() => {
        if (
            !debugMode ||
            check.type === 'exit' ||
            check.logicalState !== 'outLogic' ||
            !isImpossibleTooltip(requirements)
        ) {
            return undefined;
        }

        const startEntranceRaw = exitsById['\\Start']?.entrance?.name;
        const startEntrance = startEntranceRaw
            ? formatEntranceName(startEntranceRaw)
            : undefined;
        const area = logic.checks[checkId]?.area;
        const checkBit = logic.itemBits[checkId];
        const rawSettings = settings as Record<
            string,
            string | number | boolean | string[] | undefined
        >;
        const relevantExits = (area ? logic.exitsByHintRegion[area] : undefined)
            ?.map((exitId) => {
                const exit = exitsById[exitId];
                if (!exit) {
                    return `${exitId}: missing exit mapping`;
                }
                const status = exit.entrance
                    ? `mapped to ${formatEntranceName(exit.entrance.name)}`
                    : exit.canAssign
                      ? 'unmapped random exit'
                      : 'vanilla';
                return `${exit.exit.name}: ${status}`;
            })
            .slice(0, 8);

        return {
            checkId,
            checkName: check.checkName,
            logicalState: check.logicalState,
            checkBit,
            rawStaticRequirements: summarizeStaticRequirements(
                logic,
                checkBit,
                true,
            ),
            staticRequirements: summarizeStaticRequirements(logic, checkBit),
            staticRequirementStates: summarizeStaticRequirementStates(
                logic,
                checkBit,
                getRequirementLogicalState,
            ),
            inLogicPathFound: Boolean(inLogicPathfinding?.[checkId]),
            optimisticPathFound: Boolean(optimisticPathfinding?.[checkId]),
            startEntrance,
            area,
            relevantExits: relevantExits ?? [],
            entranceSettings: {
                randomizeEntrances: rawSettings['randomize-entrances'] as
                    | string
                    | boolean
                    | undefined,
                randomizeDungeonEntrances: rawSettings[
                    'randomize-dungeon-entrances'
                ] as string | boolean | undefined,
                randomizeTrialEntrances: rawSettings['randomize-trials'] as
                    | string
                    | boolean
                    | undefined,
                randomizeInteriorEntrances: rawSettings[
                    'randomize-interior-entrances'
                ] as string | boolean | undefined,
                randomizeOverworldEntrances: rawSettings[
                    'randomize-overworld-entrances'
                ] as string | boolean | undefined,
                randomStartEntrance: rawSettings['random-start-entrance'] as
                    | string
                    | boolean
                    | undefined,
            },
        };
    }, [
        check,
        checkId,
        exitsById,
        getRequirementLogicalState,
        inLogicPathfinding,
        logic,
        optimisticPathfinding,
        requirements,
        settings,
        debugMode,
    ]);
}
