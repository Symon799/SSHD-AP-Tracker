import { createSelector } from '@reduxjs/toolkit';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { VariableSizeList, type ListChildComponentProps } from 'react-window';
import type { TrackerLocationFilter } from '../LocalStorage';
import type { LogicalCheck } from '../logic/Logic';
import { logicSelector } from '../logic/Selectors';
import { isVegetationType } from '../logic/Vegetation';
import {
    checkedChecksSelector,
    getRequirementLogicalStateSelector,
} from '../tracker/Selectors';
import { useElementSize } from '../utils/React';
import Location from './Location';
import gridStyles from './LocationGrid.module.css';
import {
    readViewNumber,
    useRememberedOpen,
    writeViewNumber,
} from './LocationViewState';
import styles from './VegetationGroups.module.css';

export interface VegetationEntry {
    id: string;
    name: string;
    type: LogicalCheck['type'];
    checked: boolean;
    accessible: boolean;
}

export function groupVegetation(
    entries: VegetationEntry[],
    filter: TrackerLocationFilter,
) {
    return (['sign', 'grass', 'grass_blade', 'tree'] as const)
        .map((type) => {
            const all = entries.filter((entry) => entry.type === type);
            const visible = all.filter(
                (entry) =>
                    filter === 'all' ||
                    (filter === 'checked'
                        ? entry.checked
                        : !entry.checked && entry.accessible),
            );
            const patches = new Map<string, VegetationEntry[]>();
            for (const entry of all) {
                const name = entry.name.replace(/ - Blade \d+$/, '');
                const patch = patches.get(name) ?? [];
                patch.push(entry);
                patches.set(name, patch);
            }
            return { type, all, visible, patches };
        })
        .filter((group) => group.all.length > 0);
}

function Summary({
    label,
    entries,
}: {
    label: string;
    entries: VegetationEntry[];
}) {
    const checked = entries.filter((entry) => entry.checked).length;
    const accessible = entries.filter(
        (entry) => !entry.checked && entry.accessible,
    ).length;
    return (
        <summary
            aria-label={`${label}: ${checked}/${entries.length} checked, ${accessible} accessible`}
        >
            <span className={styles.summaryContent}>
                <span>{label}</span>
                <span className={styles.counts}>
                    <span>
                        ({checked}/{entries.length})
                    </span>
                    <span className={styles.accessible}>
                        {accessible} accessible
                    </span>
                </span>
            </span>
        </summary>
    );
}

type Navigation = {
    viewKey: string;
    wide: boolean;
    onChooseEntrance: (id: string) => void;
    onGoToEntrance: (id: string) => void;
};

type RowData = Omit<Navigation, 'wide' | 'viewKey'> & {
    entries: VegetationEntry[];
    columns: number;
    onMeasure: (index: number, height: number) => void;
};

function VegetationRow({
    index,
    style,
    data,
}: ListChildComponentProps<RowData>) {
    const { entries, columns, onMeasure, ...navigation } = data;
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const measure = () =>
            onMeasure(index, element.getBoundingClientRect().height);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [index, onMeasure]);
    return (
        <div style={style}>
            <div
                ref={ref}
                style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
                className={styles.row}
                data-vegetation-row
            >
                {entries
                    .slice(index * columns, (index + 1) * columns)
                    .map((entry) => (
                        <div
                            key={entry.id}
                            className={`${gridStyles.locationCell} ${gridStyles.compactCell} ${styles.cell}`}
                            data-vegetation-check
                        >
                            <Location
                                id={entry.id}
                                compact
                                forceFullName
                                {...navigation}
                            />
                        </div>
                    ))}
            </div>
        </div>
    );
}

function VirtualChecks({
    entries,
    wide,
    viewKey,
    ...navigation
}: { entries: VegetationEntry[] } & Navigation) {
    const ref = useRef<HTMLDivElement>(null);
    const { measuredWidth } = useElementSize(ref);
    const columns = wide ? 2 : 1;
    const rowCount = Math.ceil(entries.length / columns);
    const list = useRef<VariableSizeList>(null);
    // Measure wrapped text instead of reserving oversized rows at narrow widths.
    const measurementCache = useMemo(
        () => ({
            entries,
            width: measuredWidth,
            columns,
            heights: new Map<number, number>(),
        }),
        [entries, measuredWidth, columns],
    );
    const heights = measurementCache.heights;
    const [, rerender] = useState(0);
    const onMeasure = useCallback(
        (index: number, height: number) => {
            if (heights.get(index) === height) return;
            heights.set(index, height);
            list.current?.resetAfterIndex(index);
            rerender((value) => value + 1);
        },
        [heights],
    );
    useLayoutEffect(() => list.current?.resetAfterIndex(0), [heights]);
    const rowHeight = (index: number) => heights.get(index) ?? 34;
    const totalHeight = Array.from({ length: rowCount }, (_, index) =>
        rowHeight(index),
    ).reduce((sum, height) => sum + height, 0);
    if (!entries.length) return null;
    return (
        <div ref={ref} data-vegetation-list>
            <VariableSizeList
                ref={list}
                height={Math.min(320, totalHeight)}
                width="100%"
                itemCount={rowCount}
                itemSize={rowHeight}
                initialScrollOffset={readViewNumber(viewKey + ':scroll')}
                onScroll={({ scrollOffset }) =>
                    writeViewNumber(viewKey + ':scroll', scrollOffset)
                }
                itemData={{ entries, columns, onMeasure, ...navigation }}
                itemKey={(index) =>
                    entries
                        .slice(index * columns, (index + 1) * columns)
                        .map((entry) => entry.id)
                        .join('|')
                }
            >
                {VegetationRow}
            </VariableSizeList>
        </div>
    );
}

function Patch({
    name,
    entries,
    filter,
    viewKey,
    ...navigation
}: {
    name: string;
    entries: VegetationEntry[];
    filter: TrackerLocationFilter;
} & Navigation) {
    const key = JSON.stringify([viewKey, 'patch', name]);
    const [open, setOpen] = useRememberedOpen(key);
    const visible = entries.filter(
        (entry) =>
            filter === 'all' ||
            (filter === 'checked'
                ? entry.checked
                : !entry.checked && entry.accessible),
    );
    if (!visible.length) return null;
    return (
        <details
            open={open}
            className={styles.patch}
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <Summary label={name} entries={entries} />
            {open && (
                <VirtualChecks
                    entries={visible}
                    viewKey={JSON.stringify([key, filter])}
                    {...navigation}
                />
            )}
        </details>
    );
}

function Group({
    group,
    filter,
    viewKey,
    ...navigation
}: {
    group: ReturnType<typeof groupVegetation>[number];
    filter: TrackerLocationFilter;
} & Navigation) {
    const key = JSON.stringify([viewKey, group.type]);
    const [open, setOpen] = useRememberedOpen(key);
    const label =
        group.type === 'sign'
            ? 'Signs'
            : group.type === 'tree'
              ? 'Trees'
              : group.type === 'grass_blade'
                ? 'Grass blades'
                : 'Grass';
    if (!group.visible.length) return null;
    return (
        <details
            open={open}
            className={styles.group}
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <Summary label={label} entries={group.all} />
            {open &&
                (group.type === 'grass_blade' ? (
                    [...group.patches].map(([name, entries]) => (
                        <Patch
                            key={name}
                            name={name}
                            entries={entries}
                            filter={filter}
                            viewKey={key}
                            {...navigation}
                        />
                    ))
                ) : (
                    <VirtualChecks
                        entries={group.visible}
                        viewKey={JSON.stringify([key, filter])}
                        {...navigation}
                    />
                ))}
        </details>
    );
}

export default function VegetationGroups({
    locations,
    filter,
    ...navigation
}: { locations: string[]; filter: TrackerLocationFilter } & Navigation) {
    const selectGroups = useMemo(
        () =>
            createSelector(
                [
                    logicSelector,
                    checkedChecksSelector,
                    getRequirementLogicalStateSelector,
                ],
                (logic, checked, logicalState) =>
                    groupVegetation(
                        locations
                            .filter((id) =>
                                isVegetationType(logic.checks[id]?.type ?? ''),
                            )
                            .map((id) => ({
                                id,
                                name: logic.checks[id].name,
                                type: logic.checks[id].type,
                                checked: checked.has(id),
                                accessible: logicalState(id) === 'inLogic',
                            })),
                        filter,
                    ),
            ),
        [locations, filter],
    );
    const groups = useSelector(selectGroups);
    return (
        <div className={styles.groups}>
            {groups.map((group) => (
                <Group
                    key={group.type}
                    group={group}
                    filter={filter}
                    {...navigation}
                />
            ))}
        </div>
    );
}
