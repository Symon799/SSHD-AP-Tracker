import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent,
    type ReactNode,
} from 'react';
import { useElementSize } from '../utils/React';
import {
    markerSelectionBounds,
    transformMarkers,
    type ResizeDirection,
} from './editOperations';
import { markerDisplayScale, markerMetrics } from './markerSizing';
import {
    markerEra,
    type MapDocument,
    type MapMarker,
    type MapPack,
    type MarkerStatus,
    type PackMap,
} from './pack';
import styles from './v2.module.css';

const emptyStates: Record<string, MarkerStatus> = {};
const emptyCounts: Record<string, number> = {};
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const MARKER_DRAG_DELAY = 85;
const resizeHandles = [
    { x: -1, y: -1, side: 'top left', cursor: 'nwse' },
    { x: 0, y: -1, side: 'top', cursor: 'ns' },
    { x: 1, y: -1, side: 'top right', cursor: 'nesw' },
    { x: 1, y: 0, side: 'right', cursor: 'ew' },
    { x: 1, y: 1, side: 'bottom right', cursor: 'nwse' },
    { x: 0, y: 1, side: 'bottom', cursor: 'ns' },
    { x: -1, y: 1, side: 'bottom left', cursor: 'nesw' },
    { x: -1, y: 0, side: 'left', cursor: 'ew' },
] as const satisfies readonly (ResizeDirection & {
    side: string;
    cursor: string;
})[];
const clampZoom = (value: number) =>
    Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

export function Icon({ name }: { name: string }) {
    return <i className={`fas fa-${name}`} aria-hidden="true" />;
}

export default function MapCanvas({
    map,
    images,
    selected,
    onSelect,
    onMove,
    onPlace,
    onHover,
    onLeave,
    onViewportChange,
    onDropCheck,
    onNavigateLink,
    onBackgroundClick,
    overlay,
    navigation,
    markerTitles,
    checkEras,
    onTransformChecks,
    states = emptyStates,
    counts = emptyCounts,
}: {
    map: PackMap;
    images: MapDocument['images'];
    selected?: string;
    onSelect: (marker: MapMarker, anchor?: DOMRect) => void;
    onNavigateLink?: (marker: Extract<MapMarker, { kind: 'link' }>) => void;
    onMove?: (id: string, x: number, y: number, mergeTarget?: string) => void;
    onPlace?: (x: number, y: number) => void;
    onBackgroundClick?: () => void;
    overlay?: ReactNode;
    navigation?: ReactNode;
    markerTitles?: Record<string, string>;
    checkEras?: MapPack['checkEras'];
    onTransformChecks?: (next: PackMap) => void;
    onHover?: (marker: MapMarker, anchor: DOMRect) => void;
    onLeave?: () => void;
    onViewportChange?: () => void;
    onDropCheck?: (
        payload: string,
        x: number,
        y: number,
        targetId?: string,
    ) => void;
    states?: Record<string, MarkerStatus>;
    counts?: Record<string, number>;
}) {
    const viewport = useRef<HTMLDivElement>(null);
    const stage = useRef<HTMLDivElement>(null);
    const { measuredWidth, measuredHeight } = useElementSize(viewport);
    const [zoom, setZoom] = useState(1);
    const zoomRef = useRef(1);
    const zoomAnchor = useRef<
        | {
              x: number;
              y: number;
              clientX: number;
              clientY: number;
          }
        | undefined
    >(undefined);
    const viewportChanged = useRef(onViewportChange);
    viewportChanged.current = onViewportChange;
    const [dropTarget, setDropTarget] = useState<string>();
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const next = clampZoom(
                zoomRef.current * Math.exp(-event.deltaY * 0.0015),
            );
            if (next === zoomRef.current || !stage.current) return;
            viewportChanged.current?.();
            const before = stage.current.getBoundingClientRect();
            zoomAnchor.current = {
                x: (event.clientX - before.left) / before.width,
                y: (event.clientY - before.top) / before.height,
                clientX: event.clientX,
                clientY: event.clientY,
            };
            zoomRef.current = next;
            setZoom(next);
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => {
            element.removeEventListener('wheel', wheel);
        };
    }, []);
    useLayoutEffect(() => {
        const anchor = zoomAnchor.current;
        zoomAnchor.current = undefined;
        if (!anchor || !stage.current || !viewport.current) return;
        // Measure the committed map size before painting, not in an earlier wheel frame.
        const after = stage.current.getBoundingClientRect();
        viewport.current.scrollLeft +=
            after.left + anchor.x * after.width - anchor.clientX;
        viewport.current.scrollTop +=
            after.top + anchor.y * after.height - anchor.clientY;
    }, [zoom]);
    const changeZoom = (value: number) => {
        zoomAnchor.current = undefined;
        const next = clampZoom(value);
        zoomRef.current = next;
        setZoom(next);
        viewportChanged.current?.();
    };
    const [preview, setPreview] = useState<{
        id: string;
        x: number;
        y: number;
    }>();
    const [batchMode, setBatchMode] = useState(false);
    const [batchIds, setBatchIds] = useState<Set<string>>(() => new Set());
    const [marquee, setMarquee] = useState<{
        x: number;
        y: number;
        width: number;
        height: number;
    }>();
    type TransformPreview = {
        x: number;
        y: number;
        resize?: ResizeDirection;
    };
    const [offset, setOffset] = useState<TransformPreview>();
    const previewFrame = useRef<number>(0);
    const pendingOffset = useRef<TransformPreview | undefined>(undefined);
    const queueOffset = (next: TransformPreview) => {
        pendingOffset.current = next;
        if (!previewFrame.current) {
            previewFrame.current = requestAnimationFrame(() => {
                previewFrame.current = 0;
                setOffset(pendingOffset.current);
            });
        }
    };
    const resetOffset = () => {
        cancelAnimationFrame(previewFrame.current);
        previewFrame.current = 0;
        pendingOffset.current = undefined;
        setOffset(undefined);
    };
    useEffect(() => () => cancelAnimationFrame(previewFrame.current), []);
    const selectionFrame = useRef<HTMLDivElement>(null);
    const markerScale = markerDisplayScale(measuredWidth, measuredHeight, zoom);
    const framePadding = markerMetrics(markerScale, 0).size / 2 + 8;
    const skipBatchClick = useRef(false);
    const batchCount = map.markers.filter((marker) =>
        batchIds.has(marker.id),
    ).length;
    const displayedMap = offset
        ? transformMarkers(map, batchIds, offset.x, offset.y, offset.resize)
        : map;
    const selectionBounds =
        batchMode && !onPlace
            ? markerSelectionBounds(displayedMap, batchIds)
            : undefined;
    const transform = (dx: number, dy: number, resize?: ResizeDirection) => {
        const next = transformMarkers(map, batchIds, dx, dy, resize);
        if (next !== map) onTransformChecks?.(next);
    };
    const drag = useRef<
        | {
              id?: string;
              resize?: ResizeDirection;
              insideSelection: boolean;
              startedAt: number;
              x: number;
              y: number;
              left: number;
              top: number;
              moved: boolean;
          }
        | undefined
    >(undefined);
    const fit = Math.max(
        0.05,
        Math.min(
            (measuredWidth - 48) / map.width,
            (measuredHeight - 48) / map.height,
        ),
    );
    const point = (event: PointerEvent) => {
        const bounds = stage.current!.getBoundingClientRect();
        return {
            x: Math.round(
                Math.max(
                    0,
                    Math.min(
                        map.width,
                        ((event.clientX - bounds.left) / bounds.width) *
                            map.width,
                    ),
                ),
            ),
            y: Math.round(
                Math.max(
                    0,
                    Math.min(
                        map.height,
                        ((event.clientY - bounds.top) / bounds.height) *
                            map.height,
                    ),
                ),
            ),
        };
    };
    const begin = (
        event: PointerEvent,
        id?: string,
        resize?: ResizeDirection,
    ) => {
        if (event.button !== 0) return;
        if (id && !onMove) return;
        skipBatchClick.current = false;
        viewportChanged.current?.();
        event.stopPropagation();
        const element = viewport.current!;
        const frame = selectionFrame.current?.getBoundingClientRect();
        const insideSelection = Boolean(
            frame &&
                event.clientX >= frame.left &&
                event.clientX <= frame.right &&
                event.clientY >= frame.top &&
                event.clientY <= frame.bottom,
        );
        if (insideSelection && !id) event.preventDefault();
        drag.current = {
            id,
            resize,
            insideSelection,
            startedAt: event.timeStamp,
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
            moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
        const current = drag.current;
        if (!current) return;
        const distance = Math.hypot(
            current.x - event.clientX,
            current.y - event.clientY,
        );
        if (
            distance > 3 &&
            (!current.id ||
                event.timeStamp - current.startedAt >= MARKER_DRAG_DELAY)
        )
            current.moved = true;
        if (current.resize) {
            if (current.moved)
                queueOffset({
                    x: (event.clientX - current.x) / (fit * zoom),
                    y: (event.clientY - current.y) / (fit * zoom),
                    resize: current.resize,
                });
            return;
        }
        if (batchMode && !onPlace) {
            if (!current.moved) return;
            if (current.insideSelection) {
                queueOffset({
                    x: (event.clientX - current.x) / (fit * zoom),
                    y: (event.clientY - current.y) / (fit * zoom),
                });
            } else if (!current.id) {
                const bounds = stage.current!.getBoundingClientRect();
                setMarquee({
                    x: Math.min(current.x, event.clientX) - bounds.left,
                    y: Math.min(current.y, event.clientY) - bounds.top,
                    width: Math.abs(event.clientX - current.x),
                    height: Math.abs(event.clientY - current.y),
                });
            }
            return;
        }
        if (current.id) {
            if (!current.moved) return;
            setPreview({ id: current.id, ...point(event) });
            const source = map.markers.find(
                (marker) => marker.id === current.id,
            );
            setDropTarget(
                source?.kind === 'checks'
                    ? closestMarker(event.clientX, event.clientY, current.id)
                    : undefined,
            );
        } else {
            viewport.current!.scrollLeft =
                current.left - event.clientX + current.x;
            viewport.current!.scrollTop =
                current.top - event.clientY + current.y;
        }
    };
    const closestMarker = (x: number, y: number, exclude?: string) =>
        map.markers.find((marker) => {
            if (marker.kind !== 'checks' || marker.id === exclude) return false;
            const button = stage.current?.querySelector(
                `[data-marker-id="${marker.id}"]`,
            );
            const bounds = button?.getBoundingClientRect();
            return (
                bounds &&
                Math.hypot(
                    bounds.x + bounds.width / 2 - x,
                    bounds.y + bounds.height / 2 - y,
                ) < 20
            );
        })?.id;
    const end = (event: PointerEvent) => {
        const current = drag.current;
        if (!current) return;
        const moved =
            current.moved ||
            (!current.id &&
                Math.hypot(
                    current.x - event.clientX,
                    current.y - event.clientY,
                ) > 3);
        if (current.resize) {
            if (moved)
                transform(
                    (event.clientX - current.x) / (fit * zoom),
                    (event.clientY - current.y) / (fit * zoom),
                    current.resize,
                );
        } else if (batchMode && !onPlace) {
            skipBatchClick.current = moved;
            if (current.insideSelection) {
                if (moved)
                    transform(
                        (event.clientX - current.x) / (fit * zoom),
                        (event.clientY - current.y) / (fit * zoom),
                    );
            } else if (!current.id) {
                const bounds = stage.current!.getBoundingClientRect();
                const ids = map.markers
                    .filter((marker) => {
                        const x =
                            bounds.left + (marker.x / map.width) * bounds.width;
                        const y =
                            bounds.top +
                            (marker.y / map.height) * bounds.height;
                        return (
                            moved &&
                            x >= Math.min(current.x, event.clientX) &&
                            x <= Math.max(current.x, event.clientX) &&
                            y >= Math.min(current.y, event.clientY) &&
                            y <= Math.max(current.y, event.clientY)
                        );
                    })
                    .map((marker) => marker.id);
                setBatchIds(new Set(ids));
            }
        } else if (current.id && moved) {
            const position = point(event);
            const source = map.markers.find(
                (marker) => marker.id === current.id,
            );
            onMove?.(
                current.id,
                position.x,
                position.y,
                source?.kind === 'checks'
                    ? closestMarker(event.clientX, event.clientY, current.id)
                    : undefined,
            );
        } else if (!current.id && !moved) {
            if (!onPlace) onBackgroundClick?.();
            const bounds = stage.current!.getBoundingClientRect();
            if (
                event.clientX >= bounds.left &&
                event.clientX <= bounds.right &&
                event.clientY >= bounds.top &&
                event.clientY <= bounds.bottom
            ) {
                const position = point(event);
                onPlace?.(position.x, position.y);
            }
        }
        drag.current = undefined;
        setPreview(undefined);
        setDropTarget(undefined);
        setMarquee(undefined);
        resetOffset();
    };
    return (
        <section className={styles.canvas} aria-label={`Map: ${map.name}`}>
            <div className={styles.mapToolbar}>
                <div className={styles.mapHeading}>
                    {navigation}
                    <h2>{map.name}</h2>
                </div>
                <div className={styles.actions}>
                    {onTransformChecks && (
                        <button
                            type="button"
                            aria-label="Select map markers"
                            title="Select map markers"
                            aria-pressed={batchMode && !onPlace}
                            disabled={Boolean(onPlace)}
                            onClick={() => {
                                if (!batchMode) onBackgroundClick?.();
                                setBatchMode(!batchMode);
                                setBatchIds(new Set());
                            }}
                        >
                            <Icon name="object-group" />
                        </button>
                    )}
                    {batchMode && !onPlace && (
                        <output
                            className={styles.selectionCount}
                            aria-label="Selected map markers"
                        >
                            {batchCount} {batchCount > 1 ? 'markers' : 'marker'}{' '}
                            selected
                        </output>
                    )}
                    <button
                        type="button"
                        title="Zoom out"
                        aria-label="Zoom out"
                        disabled={zoom <= MIN_ZOOM}
                        onClick={() => changeZoom(zoom / 1.25)}
                    >
                        <Icon name="minus" />
                    </button>
                    <output aria-label="Map zoom">
                        {Math.round(zoom * 100)}%
                    </output>
                    <button
                        type="button"
                        title="Zoom in"
                        aria-label="Zoom in"
                        disabled={zoom >= MAX_ZOOM}
                        onClick={() => changeZoom(zoom * 1.25)}
                    >
                        <Icon name="plus" />
                    </button>
                    <button
                        type="button"
                        title="Fit map"
                        aria-label="Fit map"
                        onClick={() => {
                            changeZoom(1);
                            if (viewport.current)
                                viewport.current.scrollTo(0, 0);
                        }}
                    >
                        <Icon name="expand" />
                    </button>
                </div>
            </div>
            <div className={styles.canvasArea}>
                {Boolean(overlay) && (
                    <div className={styles.mapOverlay}>{overlay}</div>
                )}
                <div
                    className={`${styles.viewport} ${batchMode && !onPlace ? styles.marqueeMode : ''}`}
                    ref={viewport}
                    data-testid="map-viewport"
                    onDragOver={(event) => {
                        if (
                            onDropCheck &&
                            event.dataTransfer.types.includes(
                                'application/x-sshd-check',
                            )
                        )
                            event.preventDefault();
                    }}
                    onDrop={(event) => {
                        const payload = event.dataTransfer.getData(
                            'application/x-sshd-check',
                        );
                        if (!payload || !onDropCheck) return;
                        event.preventDefault();
                        const bounds = stage.current!.getBoundingClientRect();
                        onDropCheck(
                            payload,
                            Math.max(
                                0,
                                Math.min(
                                    map.width,
                                    ((event.clientX - bounds.left) /
                                        bounds.width) *
                                        map.width,
                                ),
                            ),
                            Math.max(
                                0,
                                Math.min(
                                    map.height,
                                    ((event.clientY - bounds.top) /
                                        bounds.height) *
                                        map.height,
                                ),
                            ),
                            closestMarker(event.clientX, event.clientY),
                        );
                    }}
                    onPointerDown={(event) => begin(event)}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={() => {
                        drag.current = undefined;
                        setPreview(undefined);
                        setMarquee(undefined);
                        resetOffset();
                        setDropTarget(undefined);
                    }}
                >
                    <div
                        className={styles.stage}
                        ref={stage}
                        data-testid="map-stage"
                        style={{
                            width: map.width * fit * zoom,
                            height: map.height * fit * zoom,
                        }}
                    >
                        <img
                            src={images[map.image]}
                            alt={map.name}
                            draggable={false}
                        />
                        {marquee && (
                            <div
                                className={styles.marquee}
                                style={{
                                    left: marquee.x,
                                    top: marquee.y,
                                    width: marquee.width,
                                    height: marquee.height,
                                }}
                            />
                        )}
                        {selectionBounds && !marquee && (
                            <div
                                className={`${styles.marquee} ${styles.selectionFrame}`}
                                ref={selectionFrame}
                                data-testid="map-selection-frame"
                                style={{
                                    left:
                                        selectionBounds.left * fit * zoom -
                                        framePadding,
                                    top:
                                        selectionBounds.top * fit * zoom -
                                        framePadding,
                                    width:
                                        (selectionBounds.right -
                                            selectionBounds.left) *
                                            fit *
                                            zoom +
                                        framePadding * 2,
                                    height:
                                        (selectionBounds.bottom -
                                            selectionBounds.top) *
                                            fit *
                                            zoom +
                                        framePadding * 2,
                                }}
                            >
                                {batchCount > 1 &&
                                    resizeHandles.map((handle) => {
                                        const label = `Resize selection: ${handle.side}`;
                                        return (
                                            <button
                                                key={handle.side}
                                                type="button"
                                                className={styles.resizeHandle}
                                                aria-label={label}
                                                title={label}
                                                style={{
                                                    left: `${(handle.x + 1) * 50}%`,
                                                    top: `${(handle.y + 1) * 50}%`,
                                                    cursor: `${handle.cursor}-resize`,
                                                }}
                                                onPointerDown={(event) =>
                                                    begin(
                                                        event,
                                                        undefined,
                                                        handle,
                                                    )
                                                }
                                                onKeyDown={(event) => {
                                                    const x =
                                                        handle.x === 0
                                                            ? 0
                                                            : event.key ===
                                                                'ArrowRight'
                                                              ? 1
                                                              : event.key ===
                                                                  'ArrowLeft'
                                                                ? -1
                                                                : 0;
                                                    const y =
                                                        handle.y === 0
                                                            ? 0
                                                            : event.key ===
                                                                'ArrowDown'
                                                              ? 1
                                                              : event.key ===
                                                                  'ArrowUp'
                                                                ? -1
                                                                : 0;
                                                    if (!x && !y) return;
                                                    event.preventDefault();
                                                    const step =
                                                        (event.shiftKey
                                                            ? 10
                                                            : 1) /
                                                        (fit * zoom);
                                                    transform(
                                                        x * step,
                                                        y * step,
                                                        handle,
                                                    );
                                                }}
                                            />
                                        );
                                    })}
                            </div>
                        )}
                        {displayedMap.markers.map((marker) => {
                            const batchSelected =
                                batchMode &&
                                !onPlace &&
                                batchIds.has(marker.id);
                            const era =
                                marker.kind === 'checks'
                                    ? markerEra(checkEras, marker.checkIds)
                                    : undefined;
                            const metrics = markerMetrics(
                                markerScale,
                                marker.kind === 'checks'
                                    ? (counts[marker.id] ??
                                          marker.checkIds.length)
                                    : 0,
                            );
                            return states[marker.id] === 'empty' ? null : (
                                <button
                                    type="button"
                                    key={marker.id}
                                    className={`${styles.marker} ${marker.kind === 'link' ? styles.linkMarker : ''} ${selected === marker.id ? styles.selectedMarker : ''} ${dropTarget === marker.id ? styles.dropTarget : ''}`}
                                    data-status={
                                        states[marker.id] ?? 'available'
                                    }
                                    data-marker-id={marker.id}
                                    data-check-era={era}
                                    data-batch-selected={
                                        batchSelected || undefined
                                    }
                                    data-count-visible={
                                        marker.kind === 'checks' &&
                                        metrics.showCount
                                    }
                                    aria-label={marker.label}
                                    onDoubleClick={(event) => {
                                        if (
                                            !batchMode &&
                                            marker.kind === 'link' &&
                                            onNavigateLink
                                        ) {
                                            event.stopPropagation();
                                            onNavigateLink(marker);
                                        }
                                    }}
                                    onContextMenu={(event) => {
                                        if (
                                            !batchMode &&
                                            marker.kind === 'link' &&
                                            onNavigateLink
                                        ) {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            onNavigateLink(marker);
                                        }
                                    }}
                                    aria-pressed={
                                        batchMode && !onPlace
                                            ? batchSelected
                                            : selected === marker.id
                                    }
                                    title={
                                        onHover
                                            ? undefined
                                            : (markerTitles?.[marker.id] ??
                                              `${marker.label}${counts[marker.id] !== undefined ? ` · ${counts[marker.id]} remaining` : ''}`)
                                    }
                                    onPointerEnter={(event) => {
                                        if (!drag.current)
                                            onHover?.(
                                                marker,
                                                event.currentTarget.getBoundingClientRect(),
                                            );
                                    }}
                                    onPointerLeave={onLeave}
                                    onFocus={(event) =>
                                        onHover?.(
                                            marker,
                                            event.currentTarget.getBoundingClientRect(),
                                        )
                                    }
                                    onBlur={onLeave}
                                    style={{
                                        width: metrics.size,
                                        height: metrics.size,
                                        minHeight: metrics.size,
                                        fontSize:
                                            marker.kind === 'link'
                                                ? Math.max(
                                                      4,
                                                      metrics.size * 0.45,
                                                  )
                                                : metrics.fontSize,
                                        borderWidth: metrics.size < 18 ? 1 : 2,
                                        borderRadius:
                                            marker.kind === 'link'
                                                ? '50%'
                                                : Math.min(
                                                      5,
                                                      metrics.size * 0.18,
                                                  ),
                                        left: `${((preview?.id === marker.id ? preview.x : marker.x) / map.width) * 100}%`,
                                        top: `${((preview?.id === marker.id ? preview.y : marker.y) / map.height) * 100}%`,
                                    }}
                                    onPointerDown={(event) => {
                                        event.stopPropagation();
                                        begin(event, marker.id);
                                    }}
                                    onPointerMove={(event) => {
                                        event.stopPropagation();
                                        move(event);
                                    }}
                                    onPointerUp={(event) => {
                                        event.stopPropagation();
                                        end(event);
                                    }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (batchMode && !onPlace) {
                                            if (
                                                !skipBatchClick.current ||
                                                event.detail === 0
                                            )
                                                setBatchIds((previous) => {
                                                    const next = new Set(
                                                        previous,
                                                    );
                                                    if (next.has(marker.id))
                                                        next.delete(marker.id);
                                                    else next.add(marker.id);
                                                    return next;
                                                });
                                            return;
                                        }
                                        onSelect(
                                            marker,
                                            event.currentTarget.getBoundingClientRect(),
                                        );
                                    }}
                                >
                                    {marker.kind === 'link' ? (
                                        <Icon name="arrow-right" />
                                    ) : metrics.showCount ? (
                                        metrics.label
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
