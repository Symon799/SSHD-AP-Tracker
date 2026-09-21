import { useEffect, useRef, useState, type Dispatch } from 'react';
import { useSelector } from 'react-redux';
import BasicCounters from '../BasicCounters';
import {
    getStoredTrackerListPanelHeight,
    getStoredTrackerMapHeight,
    getStoredTrackerSidebarWidth,
    setStoredTrackerListPanelHeight,
    setStoredTrackerMapHeight,
    setStoredTrackerSidebarWidth,
} from '../LocalStorage';
import { itemLayoutSelector } from '../customization/Selectors';
import { CompactTextClient } from '../hints/TextClient';
import DungeonTracker from '../itemTracker/DungeonTracker';
import GridTracker from '../itemTracker/GridTracker';
import ItemTracker, {
    ITEM_TRACKER_ASPECT_RATIO,
} from '../itemTracker/ItemTracker';
import { ItemTrackerContainer } from '../itemTracker/ItemTrackerContainer';
import { LocationGroupList } from '../locationTracker/LocationGroupList';
import { LocationsEntrancesList } from '../locationTracker/LocationsEntrancesList';
import WorldMap, {
    WORLD_MAP_ASPECT_RATIO,
} from '../locationTracker/mapTracker/WorldMap';
import type {
    InterfaceAction,
    InterfaceState,
} from '../tracker/TrackerInterfaceReducer';
import { useElementSize } from '../utils/React';

export function TrackerLayout({
    interfaceState,
    interfaceDispatch,
    footerContent,
    mapOverlayContent,
}: {
    interfaceState: InterfaceState;
    interfaceDispatch: Dispatch<InterfaceAction>;
    footerContent?: React.ReactNode;
    mapOverlayContent?: React.ReactNode;
}) {
    const itemLayout = useSelector(itemLayoutSelector);
    // The map layout is the only supported location layout.
    const locationLayout: string = 'map';
    const [sidebarWidth, setSidebarWidth] = useState(
        () => getStoredTrackerSidebarWidth() ?? 390,
    );
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { measuredWidth } = useElementSize(containerRef);
    const minSidebarWidth = 300;
    const maxSidebarWidth = Math.max(
        minSidebarWidth,
        Math.floor(measuredWidth * 0.48),
    );
    const clampedSidebarWidth = Math.max(
        minSidebarWidth,
        Math.min(sidebarWidth, maxSidebarWidth),
    );

    useEffect(() => {
        if (!isResizing) {
            return;
        }
        const onMove = (event: MouseEvent) => {
            const bounds = containerRef.current?.getBoundingClientRect();
            if (!bounds) {
                return;
            }
            setSidebarWidth(event.clientX - bounds.left);
        };
        const onUp = () => setIsResizing(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizing]);

    useEffect(() => {
        setStoredTrackerSidebarWidth(clampedSidebarWidth);
    }, [clampedSidebarWidth]);

    // Warning: Layout horrors below.
    // This main tracker area used to be implemented with react-bootstrap's
    // Row and Col types while importing bootstrap v4 AND bootstrap v5 CSS
    // at the same time, and then there was some manual adjustment and
    // styling to get things to behave. So there's a bit of a chicken-and-egg
    // problem where much of the calculations and widths rely on the bootstrap
    // styles, both in this component and the subcomponents. bootstrap has been
    // removed from everything in <Tracker> and below, but we need some of the existing
    // styles so that e.g. the item tracker width calculations match up and I don't
    // want to revamp the main layout yet until more components behave predictably
    // and use modern CSS solutions with fewer manual calculations.

    let itemTracker;
    let itemTrackerAspectRatio: number | undefined;
    const showCompactApLog = itemLayout === 'grid';
    if (itemLayout === 'inventory') {
        itemTrackerAspectRatio = ITEM_TRACKER_ASPECT_RATIO;
        itemTracker = (
            <ItemTrackerContainer
                aspectRatio={ITEM_TRACKER_ASPECT_RATIO}
                itemTracker={(width) => <ItemTracker width={width} />}
            />
        );
    } else if (itemLayout === 'grid') {
        itemTracker = (
            <ItemTrackerContainer
                widthOnly
                itemTracker={(width) => <GridTracker width={width} />}
            />
        );
    }
    const itemTrackerBlock = (
        <div
            style={{
                flex: '0 0 auto',
                width: '100%',
                ...(showCompactApLog
                    ? {}
                    : {
                          aspectRatio: itemTrackerAspectRatio
                              ? String(itemTrackerAspectRatio)
                              : undefined,
                          minHeight: 0,
                          position: 'relative',
                      }),
            }}
        >
            {itemTracker}
        </div>
    );
    const compactApLogBlock = showCompactApLog ? (
        <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
            <CompactTextClient />
        </div>
    ) : null;
    const itemTrackerWithLogBlock = showCompactApLog ? (
        <div
            style={{
                flex: '1 1 0',
                minHeight: 0,
                display: 'flex',
                flexFlow: 'column nowrap',
                gap: '14px',
            }}
        >
            {itemTrackerBlock}
            {compactApLogBlock}
        </div>
    ) : (
        itemTrackerBlock
    );
    const footerBlock = footerContent ? (
        <div style={{ flex: '0 0 auto' }}>{footerContent}</div>
    ) : null;

    if (locationLayout === 'list') {
        return (
            <div
                ref={containerRef}
                style={{
                    display: 'flex',
                    width: '100%',
                    height: '100%',
                    minWidth: 0,
                }}
            >
                <div
                    style={{
                        flex: `0 0 ${clampedSidebarWidth}px`,
                        minWidth: minSidebarWidth,
                        maxWidth: maxSidebarWidth,
                    }}
                >
                    <div
                        style={{
                            padding: '0.75rem',
                            height: '100%',
                            width: '100%',
                            display: 'flex',
                            flexFlow: 'column nowrap',
                            gap: '12px',
                            minHeight: 0,
                        }}
                    >
                        <div
                            style={{
                                flex: '1 1 0',
                                minHeight: 0,
                                display: 'flex',
                                flexFlow: 'column nowrap',
                                gap: '12px',
                            }}
                        >
                            <BasicCounters compact />
                            <DungeonTracker
                                interfaceDispatch={interfaceDispatch}
                                compact
                            />
                            {itemTrackerWithLogBlock}
                        </div>
                        {footerBlock}
                    </div>
                </div>
                <button
                    type="button"
                    style={{
                        flex: '0 0 12px',
                        cursor: 'col-resize',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'stretch',
                        padding: '6px 0',
                        border: 0,
                        background: 'transparent',
                    }}
                    onMouseDown={() => setIsResizing(true)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize tracker panels"
                >
                    <div
                        style={{
                            width: 4,
                            borderRadius: 999,
                            background:
                                'color-mix(in srgb, var(--scheme-text) 16%, transparent)',
                        }}
                    />
                </button>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <ListLayoutRightColumn
                        interfaceState={interfaceState}
                        interfaceDispatch={interfaceDispatch}
                    />
                </div>
            </div>
        );
    } else {
        return (
            <div
                ref={containerRef}
                style={{
                    display: 'flex',
                    width: '100%',
                    height: '100%',
                    minWidth: 0,
                }}
            >
                <div
                    style={{
                        flex: `0 0 ${clampedSidebarWidth}px`,
                        minWidth: minSidebarWidth,
                        maxWidth: maxSidebarWidth,
                    }}
                >
                    <div
                        style={{
                            padding: '6px 0.85rem 0.75rem 0.75rem',
                            display: 'flex',
                            flexFlow: 'column',
                            height: '100%',
                            width: '100%',
                            gap: '12px',
                            minHeight: 0,
                        }}
                    >
                        <div
                            style={{
                                flex: '1 1 0',
                                minHeight: 0,
                                display: 'flex',
                                flexFlow: 'column nowrap',
                                gap: '12px',
                            }}
                        >
                            <BasicCounters compact />
                            <DungeonTracker
                                interfaceDispatch={interfaceDispatch}
                                compact
                            />
                            {itemTrackerWithLogBlock}
                        </div>
                        {footerBlock}
                    </div>
                </div>
                <button
                    type="button"
                    style={{
                        flex: '0 0 12px',
                        cursor: 'col-resize',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'stretch',
                        padding: '6px 0',
                        border: 0,
                        background: 'transparent',
                    }}
                    onMouseDown={() => setIsResizing(true)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize tracker panels"
                >
                    <div
                        style={{
                            width: 4,
                            borderRadius: 999,
                            background:
                                'color-mix(in srgb, var(--scheme-text) 16%, transparent)',
                        }}
                    />
                </button>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div
                        style={{
                            padding: '0 0.75rem 0 0.25rem',
                            height: '100%',
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        <MapLayoutCenterColumnContainer
                            interfaceDispatch={interfaceDispatch}
                            interfaceState={interfaceState}
                        />
                        {mapOverlayContent}
                    </div>
                </div>
            </div>
        );
    }
}

/**
 * The center column of the map tracker layout has some fun dynamic sizing going on.
 * The world map will expand to fill the available horizontal space, but will never
 * take up more than 55% of the available vertical space.
 */
function MapLayoutCenterColumnContainer({
    interfaceState,
    interfaceDispatch,
}: {
    interfaceState: InterfaceState;
    interfaceDispatch: Dispatch<InterfaceAction>;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [mapPanelHeight, setMapPanelHeight] = useState<number | undefined>(
        () => getStoredTrackerMapHeight(),
    );
    const [isResizingMap, setIsResizingMap] = useState(false);
    const { measuredWidth, measuredHeight } = useElementSize(ref);
    const minMapPanelHeight = 220;
    const maxMapPanelHeight = Math.max(minMapPanelHeight, measuredHeight - 240);
    const defaultMapPanelHeight = Math.min(
        Math.max(minMapPanelHeight, measuredHeight * 0.42),
        maxMapPanelHeight,
    );
    const clampedMapPanelHeight = Math.min(
        Math.max(mapPanelHeight ?? defaultMapPanelHeight, minMapPanelHeight),
        maxMapPanelHeight,
    );

    useEffect(() => {
        if (!isResizingMap) {
            return;
        }
        const onMove = (event: MouseEvent) => {
            const bounds = ref.current?.getBoundingClientRect();
            if (!bounds) {
                return;
            }
            setMapPanelHeight(event.clientY - bounds.top);
        };
        const onUp = () => setIsResizingMap(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizingMap]);

    useEffect(() => {
        setStoredTrackerMapHeight(clampedMapPanelHeight);
    }, [clampedMapPanelHeight]);

    const mapWidth = Math.min(
        measuredWidth,
        clampedMapPanelHeight * WORLD_MAP_ASPECT_RATIO,
    );
    return (
        <div style={{ width: '100%', height: '100%' }} ref={ref}>
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexFlow: 'column nowrap',
                    gap: '0',
                }}
            >
                <div
                    style={{
                        flex: `0 0 ${clampedMapPanelHeight}px`,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: 0,
                        paddingBottom: 2,
                    }}
                >
                    <WorldMap
                        width={mapWidth}
                        interfaceState={interfaceState}
                        interfaceDispatch={interfaceDispatch}
                    />
                </div>
                <button
                    type="button"
                    style={{
                        flex: '0 0 10px',
                        cursor: 'row-resize',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'stretch',
                        padding: '0 6px',
                        border: 0,
                        background: 'transparent',
                    }}
                    onMouseDown={() => setIsResizingMap(true)}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize map and location list"
                >
                    <div
                        style={{
                            height: 4,
                            width: '100%',
                            borderRadius: 999,
                            background:
                                'color-mix(in srgb, var(--scheme-text) 16%, transparent)',
                        }}
                    />
                </button>
                <div style={{ position: 'relative', flex: '1', minHeight: 0 }}>
                    <LocationsEntrancesList
                        wide
                        includeHeader
                        interfaceState={interfaceState}
                        interfaceDispatch={interfaceDispatch}
                    />
                </div>
            </div>
        </div>
    );
}

function ListLayoutRightColumn({
    interfaceState,
    interfaceDispatch,
}: {
    interfaceState: InterfaceState;
    interfaceDispatch: Dispatch<InterfaceAction>;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [listPanelHeight, setListPanelHeight] = useState<number | undefined>(
        () => getStoredTrackerListPanelHeight(),
    );
    const [isResizingList, setIsResizingList] = useState(false);
    const { measuredHeight } = useElementSize(ref);
    const minListPanelHeight = 220;
    const maxListPanelHeight = Math.max(
        minListPanelHeight,
        measuredHeight - 240,
    );
    const defaultListPanelHeight = Math.min(
        Math.max(minListPanelHeight, measuredHeight * 0.42),
        maxListPanelHeight,
    );
    const clampedListPanelHeight = Math.min(
        Math.max(listPanelHeight ?? defaultListPanelHeight, minListPanelHeight),
        maxListPanelHeight,
    );

    useEffect(() => {
        if (!isResizingList) {
            return;
        }
        const onMove = (event: MouseEvent) => {
            const bounds = ref.current?.getBoundingClientRect();
            if (!bounds) {
                return;
            }
            setListPanelHeight(event.clientY - bounds.top);
        };
        const onUp = () => setIsResizingList(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizingList]);

    useEffect(() => {
        setStoredTrackerListPanelHeight(clampedListPanelHeight);
    }, [clampedListPanelHeight]);

    return (
        <div
            ref={ref}
            style={{
                padding: '0 0.75rem',
                display: 'flex',
                flexFlow: 'column nowrap',
                height: '100%',
            }}
        >
            <div
                style={{
                    flex: `0 0 ${clampedListPanelHeight}px`,
                    minHeight: 0,
                    overflow: 'visible auto',
                }}
            >
                <LocationGroupList
                    interfaceState={interfaceState}
                    interfaceDispatch={interfaceDispatch}
                />
            </div>
            <button
                type="button"
                style={{
                    flex: '0 0 10px',
                    cursor: 'row-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'stretch',
                    padding: '0 6px',
                    border: 0,
                    background: 'transparent',
                }}
                onMouseDown={() => setIsResizingList(true)}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize location lists"
            >
                <div
                    style={{
                        height: 4,
                        width: '100%',
                        borderRadius: 999,
                        background:
                            'color-mix(in srgb, var(--scheme-text) 16%, transparent)',
                    }}
                />
            </button>
            <div style={{ flex: '1 1 0', minHeight: 0 }}>
                <LocationsEntrancesList
                    wide={false}
                    interfaceState={interfaceState}
                    interfaceDispatch={interfaceDispatch}
                />
            </div>
        </div>
    );
}
