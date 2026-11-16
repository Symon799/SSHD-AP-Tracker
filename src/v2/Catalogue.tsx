import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { VariableSizeList, type ListChildComponentProps } from 'react-window';
import { logicSelector } from '../logic/Selectors';
import { useElementSize } from '../utils/React';
import styles from './v2.module.css';

export interface CatalogueCheck {
    id: string;
    name: string;
    region: string;
    type: string;
}

export function useCatalogue() {
    const logic = useSelector(logicSelector);
    return useMemo(
        () =>
            Object.entries(logic.checks).map(([id, check]) => ({
                id,
                name: check.name,
                region: check.area ?? 'Others',
                type: check.type,
            })),
        [logic],
    );
}

interface CatalogueData {
    entries: CatalogueCheck[];
    selected: Set<string>;
    onToggle: (id: string) => void;
    dragSource?: string;
}

interface CatalogueRowData extends CatalogueData {
    onMeasure: (index: number, height: number) => void;
}

function CatalogueRow({
    index,
    style,
    data,
}: ListChildComponentProps<CatalogueRowData>) {
    const check = data.entries[index];
    const ref = useRef<HTMLDivElement>(null);
    const onMeasure = data.onMeasure;
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
                className={styles.catalogue}
                data-catalogue-row
                draggable={Boolean(data.dragSource)}
                onDragStart={(event) => {
                    if (data.dragSource)
                        event.dataTransfer.setData(
                            'application/x-sshd-check',
                            JSON.stringify({
                                sourceId: data.dragSource,
                                checkIds: data.selected.has(check.id)
                                    ? [...data.selected]
                                    : [check.id],
                            }),
                        );
                }}
            >
                <label>
                    <input
                        type="checkbox"
                        checked={data.selected.has(check.id)}
                        onChange={() => data.onToggle(check.id)}
                    />
                    <span>{check.name}</span>
                </label>
            </div>
        </div>
    );
}

export function CatalogueList({
    height = 340,
    ...props
}: CatalogueData & { height?: number | 'fill' }) {
    const ref = useRef<HTMLDivElement>(null);
    const list = useRef<VariableSizeList>(null);
    const { measuredWidth, measuredHeight } = useElementSize(ref);
    const measurementCache = useMemo(
        () => ({
            entries: props.entries,
            width: measuredWidth,
            heights: new Map<number, number>(),
        }),
        [props.entries, measuredWidth],
    );
    const heights = measurementCache.heights;
    const onMeasure = useCallback(
        (index: number, height: number) => {
            if (heights.get(index) === height) return;
            heights.set(index, height);
            list.current?.resetAfterIndex(index);
        },
        [heights],
    );
    useLayoutEffect(() => list.current?.resetAfterIndex(0), [heights]);
    return (
        <div
            ref={ref}
            style={
                height === 'fill' ? { height: '100%', minHeight: 0 } : undefined
            }
        >
            <VariableSizeList
                className={styles.catalogueViewport}
                ref={list}
                height={
                    height === 'fill' ? Math.max(1, measuredHeight) : height
                }
                width="100%"
                itemCount={props.entries.length}
                estimatedItemSize={28}
                itemSize={(index) => heights.get(index) ?? 28}
                itemKey={(index) => props.entries[index].id}
                itemData={{ ...props, onMeasure }}
            >
                {CatalogueRow}
            </VariableSizeList>
        </div>
    );
}
