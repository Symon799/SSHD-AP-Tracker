import { useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    FixedSizeList as List,
    type ListChildComponentProps,
} from 'react-window';
import { Dialog } from '../additionalComponents/Dialog';
import { Select, type SelectValue } from '../additionalComponents/Select';
import { formatEntranceName } from '../logic/Entrances';
import { forceSshdManualEntranceTestMode } from '../logic/EntranceTestMode';
import {
    entrancePoolsSelector,
    exitsSelector,
    usedEntrancesSelector,
} from '../tracker/Selectors';
import { mapEntrance } from '../tracker/Slice';
import { mapValues } from '../utils/Collections';
import { useElementSize } from '../utils/React';
import styles from './EntranceTracker.module.css';

function EntranceTracker({
    open,
    onOpenChange,
    onGoToExit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onGoToExit: (exitId: string) => void;
}) {
    const dispatch = useDispatch();
    const exits = useSelector(exitsSelector);
    const usedEntrances = useSelector(usedEntrancesSelector);
    const entrancePools = useSelector(entrancePoolsSelector);

    const [exitSearch, setExitSearch] = useState('');
    const [entranceSearch, setEntranceSearch] = useState('');
    const listViewportRef = useRef<HTMLDivElement | null>(null);
    const listOuterRef = useRef<HTMLDivElement | null>(null);
    const { measuredHeight } = useElementSize(listViewportRef);
    const listHeight =
        measuredHeight ||
        Math.max(120, Math.min(600, window.innerHeight - 240));

    const clearFilters = () => {
        setExitSearch('');
        setEntranceSearch('');
    };

    const entranceOptions: Record<string, SelectValue<string>[]> = useMemo(
        () =>
            mapValues(entrancePools, (poolValue, pool) =>
                poolValue.entrances
                    .filter(
                        (entrance) =>
                            !poolValue.usedEntrancesExcluded ||
                            !usedEntrances[pool].includes(entrance.id),
                    )
                    .map(({ id, name }) => ({
                        value: id,
                        payload: id,
                        label: name,
                    })),
            ),
        [entrancePools, usedEntrances],
    );

    const onEntranceChange = (from: string, entrance: string | undefined) => {
        const scrollTop = listOuterRef.current?.scrollTop ?? 0;
        if (!entrance) {
            dispatch(mapEntrance({ from, to: undefined }));
        } else {
            dispatch(mapEntrance({ from, to: entrance }));
        }
        requestAnimationFrame(() => {
            if (listOuterRef.current) {
                listOuterRef.current.scrollTop = scrollTop;
            }
        });
    };

    const entranceLower = entranceSearch.toLowerCase();
    const exitLower = exitSearch.toLowerCase();

    const matches = (name: string, searchString: string) => {
        if (!searchString) {
            return true;
        }
        const fragments = searchString.split(' ');
        return fragments.every((fragment) => name.includes(fragment.trim()));
    };

    const filteredRows = exits.filter((e) => {
        return (
            matches(formatEntranceName(e.exit.name).toLowerCase(), exitLower) &&
            (!entranceSearch ||
                (e.entrance &&
                    matches(
                        formatEntranceName(e.entrance.name).toLowerCase(),
                        entranceLower,
                    )))
        );
    });

    const row = ({ index, style }: ListChildComponentProps) => {
        const exit = filteredRows[index];
        return (
            <div
                key={exit.exit.id}
                style={{
                    ...style,
                    display: 'flex',
                    gap: 4,
                    borderBottom: '1px solid black',
                    alignItems: 'center',
                    padding: '0.5%',
                    filter: !exit.canAssign ? 'opacity(0.5)' : undefined,
                }}
            >
                <div
                    style={{ flex: '1', display: 'flex', alignItems: 'center' }}
                >
                    <span>{formatEntranceName(exit.exit.name)}</span>
                </div>
                <div style={{ flex: '1', minWidth: 0 }}>
                    <Select
                        selectedValue={
                            exit.entrance && {
                                label: formatEntranceName(exit.entrance.name),
                                payload: exit.entrance.id,
                                value: exit.entrance.id,
                            }
                        }
                        onValueChange={(...args) =>
                            onEntranceChange(exit.exit.id, ...args)
                        }
                        options={
                            exit.canAssign
                                ? (entranceOptions[exit.rule.pool] ?? [])
                                : []
                        }
                        label={exit.exit.name}
                        disabled={!exit.canAssign}
                        searchable
                        clearable
                    />
                </div>
                <div>
                    <button
                        type="button"
                        className="tracker-button"
                        disabled={!exit.entrance}
                        onClick={() => {
                            onOpenChange(false);
                            onGoToExit(exit.exit.id);
                        }}
                    >
                        Go to
                    </button>
                </div>
            </div>
        );
    };
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title="Entrances"
            wide
            extraWide
            hideFooter
        >
            <div className={styles.entranceDialog}>
                <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
                    <input
                        className="tracker-input"
                        style={{ flex: '1' }}
                        type="search"
                        placeholder="Search exits"
                        onChange={(e) => setExitSearch(e.target.value)}
                        value={exitSearch}
                    />
                    <input
                        className="tracker-input"
                        style={{ flex: '1' }}
                        type="search"
                        placeholder="Search entrances"
                        onChange={(e) => setEntranceSearch(e.target.value)}
                        value={entranceSearch}
                    />
                    <div>
                        <button
                            type="button"
                            className="tracker-button"
                            onClick={clearFilters}
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>
                {forceSshdManualEntranceTestMode && (
                    <p style={{ margin: '10px 2px 4px', color: '#9a6700' }}>
                        Local entrance test mode: seed settings are ignored.
                    </p>
                )}
                <div className={styles.listViewport} ref={listViewportRef}>
                    {filteredRows.length ? (
                        <List
                            outerRef={listOuterRef}
                            itemCount={filteredRows.length}
                            height={listHeight}
                            width="100%"
                            itemSize={60}
                        >
                            {row}
                        </List>
                    ) : (
                        <p
                            style={{
                                margin: '48px 0',
                                textAlign: 'center',
                                color: '#667085',
                            }}
                        >
                            No entrances match the current filters.
                        </p>
                    )}
                </div>
            </div>
        </Dialog>
    );
}

export default EntranceTracker;
