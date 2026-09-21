import clsx from 'clsx';
import { useSelector } from 'react-redux';
import Tooltip from './additionalComponents/Tooltip';
import styles from './BasicCounters.module.css';
import type { ExitMapping, LogicalState } from './logic/Locations';
import {
    exitsSelector,
    getRequirementLogicalStateSelector,
    settingsSelector,
    totalCountersSelector,
} from './tracker/Selectors';

export default function BasicCounters({
    compact,
    embedded,
    fullLabels,
}: {
    compact?: boolean;
    embedded?: boolean;
    fullLabels?: boolean;
}) {
    const state = useSelector(totalCountersSelector);

    const exits = useSelector(exitsSelector);
    const getLogicalState = useSelector(getRequirementLogicalStateSelector);
    const settings = useSelector(settingsSelector) as Record<
        string,
        string | number | boolean | string[] | undefined
    >;
    const shouldCount = (state: LogicalState) => state === 'inLogic';
    const showEntrancesCounter = [
        settings['randomize-entrances'],
        settings['randomize-dungeon-entrances'],
        settings['randomize-interior-entrances'],
        settings['randomize-overworld-entrances'],
        settings['randomize-trials'],
        settings['randomize-trial-gate-entrances'],
        settings['randomize-door-entrances'],
        settings['randomize-gate-of-time'],
        settings['random-start-entrance'],
        settings['random-start-statues'],
        settings['random-starting-spawn'],
        settings['random-starting-statues'],
    ].some(
        (value) =>
            value !== undefined &&
            value !== false &&
            value !== 'off' &&
            value !== 'None' &&
            value !== 'vanilla',
    );

    const relevantExits = exits.filter(
        (e) =>
            e.canAssign &&
            !e.rule.isKnownIrrelevant &&
            !e.entrance &&
            shouldCount(getLogicalState(e.exit.id)),
    );

    const counterRows = [
        {
            value: state.numChecked,
            shortLabel: 'Checked',
            fullLabel: 'Locations Checked',
        },
        {
            value: state.numAccessible,
            shortLabel: 'Accessible',
            fullLabel: 'Locations Accessible',
        },
        {
            value: state.numRemaining,
            shortLabel: 'Remaining',
            fullLabel: 'Locations Remaining',
        },
        ...(showEntrancesCounter && state.numExitsAccessible > 0
            ? [
                  {
                      value: state.numExitsAccessible,
                      shortLabel: 'Entrances',
                      fullLabel: 'Entrances Accessible',
                      tooltip: relevantExits.length > 0 && (
                          <EntrancesTooltip exits={relevantExits} />
                      ),
                  },
              ]
            : []),
    ];

    if (compact) {
        return (
            <div
                className={clsx(
                    styles.countersCompact,
                    embedded && styles.countersEmbedded,
                )}
            >
                {counterRows.map((row) => (
                    <div key={row.shortLabel} className={styles.compactPair}>
                        <span
                            className={clsx(
                                styles.counter,
                                styles.counterCompact,
                            )}
                        >
                            {row.value}
                        </span>
                        {fullLabels ? (
                            <span className={styles.labelCompact}>
                                {row.fullLabel}
                            </span>
                        ) : (
                            <Tooltip
                                content={
                                    row.tooltip ? (
                                        <>
                                            <div>{row.fullLabel}</div>
                                            <hr />
                                            {row.tooltip}
                                        </>
                                    ) : (
                                        row.fullLabel
                                    )
                                }
                            >
                                <span className={styles.labelCompact}>
                                    {row.shortLabel}
                                </span>
                            </Tooltip>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            className={clsx(
                styles.counters,
                embedded && styles.countersEmbedded,
            )}
        >
            {counterRows.flatMap((row) => [
                <span
                    key={`${row.shortLabel}-value`}
                    className={styles.counter}
                >
                    {row.value}
                </span>,
                fullLabels ? (
                    <span
                        key={`${row.shortLabel}-label`}
                        className={compact ? styles.labelCompact : undefined}
                    >
                        {row.fullLabel}
                    </span>
                ) : (
                    <Tooltip
                        key={`${row.shortLabel}-label`}
                        content={
                            row.tooltip ? (
                                <>
                                    <div>{row.fullLabel}</div>
                                    <hr />
                                    {row.tooltip}
                                </>
                            ) : (
                                row.fullLabel
                            )
                        }
                    >
                        <span
                            className={
                                compact ? styles.labelCompact : undefined
                            }
                        >
                            {row.shortLabel}
                        </span>
                    </Tooltip>
                ),
            ])}
        </div>
    );
}

function EntrancesTooltip({ exits }: { exits: ExitMapping[] }) {
    return (
        <ul>
            {exits.map((e) => (
                <li key={e.exit.id}>
                    <span className={styles.accessibleEntrance}>
                        {e.exit.name}
                    </span>
                </li>
            ))}
        </ul>
    );
}
