import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent,
    type ReactNode,
} from 'react';
import { useElementSize } from '../utils/React';
import { markerDisplayScale, markerMetrics } from './markerSizing';
import type { MapDocument, MapMarker, MarkerStatus, PackMap } from './pack';
import styles from './v2.module.css';

const emptyStates: Record<string, MarkerStatus> = {};
const emptyCounts: Record<string, number> = {};
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
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
    const drag = useRef<
        | {
              id?: string;
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
    const begin = (event: PointerEvent, id?: string) => {
        if (event.button !== 0) return;
        if (id && !onMove) return;
        viewportChanged.current?.();
        event.stopPropagation();
        const element = viewport.current!;
        drag.current = {
            id,
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
        if (
            Math.hypot(current.x - event.clientX, current.y - event.clientY) > 3
        )
            current.moved = true;
        if (current.id) {
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
            Math.hypot(current.x - event.clientX, current.y - event.clientY) >
                3;
        if (current.id && moved) {
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
    };
    return (
        <section className={styles.canvas} aria-label={`Map: ${map.name}`}>
            <div className={styles.mapToolbar}>
                <div className={styles.mapHeading}>
                    {navigation}
                    <h2>{map.name}</h2>
                </div>
                <div className={styles.actions}>
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
                    className={styles.viewport}
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
                        {map.markers.map((marker) => {
                            const metrics = markerMetrics(
                                markerDisplayScale(
                                    measuredWidth,
                                    measuredHeight,
                                    zoom,
                                ),
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
                                    data-count-visible={
                                        marker.kind === 'checks' &&
                                        metrics.showCount
                                    }
                                    aria-label={marker.label}
                                    onDoubleClick={(event) => {
                                        if (
                                            marker.kind === 'link' &&
                                            onNavigateLink
                                        ) {
                                            event.stopPropagation();
                                            onNavigateLink(marker);
                                        }
                                    }}
                                    onContextMenu={(event) => {
                                        if (
                                            marker.kind === 'link' &&
                                            onNavigateLink
                                        ) {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            onNavigateLink(marker);
                                        }
                                    }}
                                    aria-pressed={selected === marker.id}
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
