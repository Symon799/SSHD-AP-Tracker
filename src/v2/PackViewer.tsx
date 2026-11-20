import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
    useApConnectionStatusString,
    useTrackerTelemetry,
} from '../archipelago/ClientHooks';
import BasicCounters from '../BasicCounters';
import { CompactTextClient } from '../hints/TextClient';
import DungeonTracker from '../itemTracker/DungeonTracker';
import GridTracker from '../itemTracker/GridTracker';
import { VirtualChecks } from '../locationTracker/VegetationGroups';
import { formatEntranceName } from '../logic/Entrances';
import { forceSshdManualEntranceTestMode } from '../logic/EntranceTestMode';
import { logicSelector } from '../logic/Selectors';
import { useAppDispatch } from '../store/Store';
import { clickCheck } from '../tracker/Actions';
import {
    apCountedCheckIdsSelector,
    checkedChecksSelector,
    exitsByIdSelector,
    getRequirementLogicalStateSelector,
    hasManualEntranceMappingSelector,
} from '../tracker/Selectors';
import { useElementSize } from '../utils/React';
import { createV1CheckOrder } from './checkOrder';
import { mapCheckIds } from './editOperations';
import { matchPlayerMap } from './locationTracking';
import MapCanvas, { Icon } from './MapCanvas';
import MapHoverPanel from './MapHoverPanel';
import { findMapForChecks } from './mapNavigation';
import {
    checkEra,
    linkDestination,
    placedChecks,
    summarizeChecks,
    type CheckMarker,
    type MapDocument,
    type MapMarker,
    type MapPack,
} from './pack';
import { ResizableWorkspace } from './ResizablePanels';
import TrackerTools from './TrackerTools';
import styles from './v2.module.css';

function CheckPopup({
    marker,
    active,
    onEntrances,
    eras,
}: {
    marker: CheckMarker;
    active: Set<string>;
    onEntrances: (exitId?: string) => void;
    eras?: MapPack['checkEras'];
}) {
    const logic = useSelector(logicSelector);
    const checked = useSelector(checkedChecksSelector);
    const logicalState = useSelector(getRequirementLogicalStateSelector);
    const orderChecks = useMemo(() => createV1CheckOrder(logic), [logic]);
    const entries = orderChecks(marker.checkIds)
        .filter((id) => active.has(id) && logic.checks[id])
        .map((id) => {
            const era = checkEra(eras, id);
            return {
                id,
                name:
                    logic.checks[id].name +
                    (era === 'past'
                        ? ' (Past)'
                        : era === 'present'
                          ? ' (Present)'
                          : ''),
                type: logic.checks[id].type,
                checked: checked.has(id),
                accessible: logicalState(id) === 'inLogic',
            };
        });
    return (
        <>
            {marker.note && <p className={styles.hoverNote}>{marker.note}</p>}
            {entries.length ? (
                <VirtualChecks
                    key={marker.id}
                    viewKey={`v2-hover:${marker.id}`}
                    wide={false}
                    entries={entries}
                    onChooseEntrance={onEntrances}
                    onGoToEntrance={onEntrances}
                />
            ) : (
                <p className={styles.muted}>No active checks.</p>
            )}
        </>
    );
}

export default function PackViewer({
    document,
    onEntrances,
    requestedMap,
    notice,
    trackingPaused = false,
    presetControl,
}: {
    document: MapDocument;
    onEntrances: (exitId?: string) => void;
    requestedMap?: { id: string };
    notice?: string;
    trackingPaused?: boolean;
    presetControl?: ReactNode;
}) {
    const { pack, images } = document;
    const telemetry = useTrackerTelemetry();
    const [followPlayer, setFollowPlayer] = useState(() => {
        try {
            return localStorage.getItem('sshd-v2:follow-player') !== 'false';
        } catch {
            return true;
        }
    });
    const followed = useRef('');
    const playerMap = matchPlayerMap(pack, telemetry.location);
    const logic = useSelector(logicSelector);
    const [navigationNotice, setNavigationNotice] = useState('');
    const [toolsOpen, setToolsOpen] = useState(false);
    const inventoryRef = useRef<HTMLDivElement>(null);
    const { measuredWidth: inventoryWidth } = useElementSize(inventoryRef);
    const ids = useSelector(apCountedCheckIdsSelector);
    const active = useMemo(() => new Set(ids), [ids]);
    const checked = useSelector(checkedChecksSelector);
    const getState = useSelector(getRequirementLogicalStateSelector);
    const exits = useSelector(exitsByIdSelector);
    const entranceRandomized = useSelector(hasManualEntranceMappingSelector);
    const connection = useApConnectionStatusString();
    const dispatch = useAppDispatch();
    const [mapId, setMapId] = useState(
        () => localStorage.getItem(`sshd-v2-map:${pack.id}`) ?? pack.maps[0].id,
    );
    const [history, setHistory] = useState<string[]>([]);
    const visibleMapId = useRef(mapId);
    visibleMapId.current = mapId;
    useEffect(() => {
        if (!telemetry.session) {
            followed.current = '';
            return;
        }
        if (
            !followPlayer ||
            trackingPaused ||
            telemetry.state === 'loading' ||
            !telemetry.locationRevision ||
            !playerMap.mapId
        )
            return;
        const key = JSON.stringify([
            telemetry.session,
            telemetry.locationRevision,
            pack.id,
            playerMap.mapId,
        ]);
        if (followed.current === key) return;
        followed.current = key;
        if (visibleMapId.current !== playerMap.mapId) {
            setMapId(playerMap.mapId);
            setHover(undefined);
        }
    }, [
        followPlayer,
        trackingPaused,
        telemetry.session,
        telemetry.locationRevision,
        telemetry.state,
        pack.id,
        playerMap.mapId,
    ]);
    const map = pack.maps.find((entry) => entry.id === mapId) ?? pack.maps[0];
    const [hover, setHover] = useState<{
        marker: MapMarker;
        anchor: DOMRect;
    }>();
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const keepOpen = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
    };
    const close = () => {
        keepOpen();
        setHover(undefined);
    };
    const goToPlayer = () => {
        if (
            !telemetry.session ||
            telemetry.state !== 'ready' ||
            trackingPaused ||
            !playerMap.mapId
        )
            return;
        close();
        setMapId(playerMap.mapId);
    };
    const closeSoon = () => {
        keepOpen();
        closeTimer.current = setTimeout(() => setHover(undefined), 250);
    };
    const openHover = (marker: MapMarker, anchor: DOMRect) => {
        keepOpen();
        setHover({ marker, anchor });
    };
    useEffect(
        () => () => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
        },
        [],
    );
    useEffect(() => {
        if (requestedMap) {
            setMapId(requestedMap.id);
            setHover(undefined);
        }
    }, [requestedMap]);
    useEffect(() => {
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setHover(undefined);
        };
        const resized = () => setHover(undefined);
        window.addEventListener('keydown', escape);
        window.addEventListener('resize', resized);
        return () => {
            window.removeEventListener('keydown', escape);
            window.removeEventListener('resize', resized);
        };
    }, []);
    useEffect(() => {
        const outside = (event: globalThis.PointerEvent) => {
            const target = event.target;
            if (
                target instanceof Element &&
                !target.closest(`.${styles.hoverPopup}`) &&
                !target.closest('[data-marker-id]')
            )
                setHover(undefined);
        };
        window.document.addEventListener('pointerdown', outside);
        return () =>
            window.document.removeEventListener('pointerdown', outside);
    }, []);
    const available = (id: string) => getState(id) === 'inLogic';
    const destination = (marker: MapMarker) =>
        marker.kind === 'link'
            ? linkDestination(
                  marker,
                  pack,
                  marker.exitId
                      ? exits[marker.exitId]?.entrance?.id
                      : undefined,
              )
            : undefined;
    const summaries = Object.fromEntries(
        map.markers.map((marker) => [
            marker.id,
            summarizeChecks(
                marker.kind === 'checks'
                    ? marker.checkIds
                    : mapCheckIds(pack, destination(marker) ?? ''),
                active,
                checked,
                available,
            ),
        ]),
    );
    const placed = useMemo(() => placedChecks(pack), [pack]);
    const unplaced = ids.filter((id) => !placed.has(id));
    const navigate = (id: string) => {
        close();
        setNavigationNotice('');
        if (id !== map.id) setHistory([...history, map.id]);
        setMapId(id);
        localStorage.setItem(`sshd-v2-map:${pack.id}`, id);
    };
    const activate = (marker: MapMarker, anchor?: DOMRect) => {
        if (marker.kind === 'link') {
            const target = destination(marker);
            if (target) navigate(target);
            else {
                close();
                onEntrances(marker.exitId);
            }
        } else {
            const visible = marker.checkIds.filter((id) => active.has(id));
            if (visible.length === 1)
                dispatch(clickCheck({ checkId: visible[0] }));
            if (anchor) openHover(marker, anchor);
        }
    };
    const hovered = hover?.marker;
    const target = hovered ? destination(hovered) : undefined;
    const footer = (
        <footer className={`${styles.footer} ${styles.footerDock}`}>
            <nav
                className={styles.footerActions}
                aria-label="Tracker navigation"
            >
                <button
                    type="button"
                    aria-label={toolsOpen ? 'Tracker' : 'Server & Tools'}
                    title={toolsOpen ? 'Tracker' : 'Server & Tools'}
                    onClick={() => {
                        close();
                        setToolsOpen(!toolsOpen);
                    }}
                >
                    <Icon name={toolsOpen ? 'window-maximize' : 'cog'} />
                </button>
                <Link
                    className={styles.footerIconLink}
                    to="/v2/connect"
                    aria-label="Connect"
                    title="Connect to Archipelago"
                >
                    <Icon name="plug" />
                </Link>
            </nav>
            <span className={styles.connectionCaption} title={connection}>
                {connection}
            </span>
        </footer>
    );
    return (
        <div className={styles.app}>
            <header className={styles.header}>
                <strong>SSHD Map Tracker</strong>
                <span className={styles.badge}>V2 Preview</span>
                <nav>
                    {presetControl}
                    <span className={styles.packCaption} title={pack.name}>
                        {pack.name}
                    </span>
                    <Link to="/v2/editor">Map Editor</Link>
                </nav>
            </header>
            {toolsOpen ? (
                <section
                    className={styles.toolsPage}
                    aria-label="Server & Tools"
                >
                    <TrackerTools footer={footer} pack={pack} />
                </section>
            ) : (
                <ResizableWorkspace
                    storageKey="reader"
                    left={
                        <aside
                            className={`${styles.sidebar} ${styles.readerSidebar}`}
                        >
                            <BasicCounters compact />
                            <section aria-label="Dungeons">
                                <DungeonTracker
                                    compact
                                    interfaceDispatch={(action) => {
                                        if (action.type !== 'selectHintRegion')
                                            return;
                                        const target = findMapForChecks(
                                            pack,
                                            logic.checksByHintRegion[
                                                action.hintRegion
                                            ] ?? [],
                                        );
                                        if (target) navigate(target);
                                        else
                                            setNavigationNotice(
                                                'No map contains checks for this dungeon in the current pack.',
                                            );
                                    }}
                                />
                            </section>
                            <div ref={inventoryRef}>
                                <GridTracker
                                    width={Math.max(160, inventoryWidth || 250)}
                                />
                            </div>
                            <div className={styles.actions}>
                                {unplaced.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={(event) =>
                                            openHover(
                                                {
                                                    id: 'unplaced',
                                                    kind: 'checks',
                                                    label: 'Unplaced checks',
                                                    x: 0,
                                                    y: 0,
                                                    checkIds: unplaced,
                                                },
                                                event.currentTarget.getBoundingClientRect(),
                                            )
                                        }
                                    >
                                        Unplaced checks ({unplaced.length})
                                    </button>
                                )}
                            </div>
                            <div className={styles.grow}>
                                <CompactTextClient />
                            </div>
                            {footer}
                        </aside>
                    }
                >
                    <MapCanvas
                        checkEras={pack.checkEras}
                        key={`${pack.id}:${map.id}`}
                        map={map}
                        images={images}
                        navigation={
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    aria-label="Follow player"
                                    aria-pressed={followPlayer}
                                    title={`Follow player: ${followPlayer ? 'on' : 'off'} (${telemetry.state === 'waiting' ? 'waiting for client telemetry' : playerMap.reason}). Right-click to go to player`}
                                    onClick={() => {
                                        const next = !followPlayer;
                                        followed.current = '';
                                        setFollowPlayer(next);
                                        if (next) goToPlayer();
                                        try {
                                            localStorage.setItem(
                                                'sshd-v2:follow-player',
                                                String(next),
                                            );
                                        } catch {
                                            /* Optional preference. */
                                        }
                                    }}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        goToPlayer();
                                    }}
                                >
                                    <Icon name="crosshairs" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Previous map"
                                    title="Previous map"
                                    disabled={!history.length}
                                    onClick={() => {
                                        const previous = history.at(-1);
                                        if (previous) {
                                            close();
                                            setMapId(previous);
                                            setHistory(history.slice(0, -1));
                                        }
                                    }}
                                >
                                    <Icon name="arrow-left" />
                                </button>
                                <button
                                    type="button"
                                    title="World map"
                                    aria-label="World map"
                                    onClick={() => navigate(pack.maps[0].id)}
                                >
                                    <Icon name="globe" />
                                </button>
                            </div>
                        }
                        selected={hovered?.id}
                        onSelect={activate}
                        onHover={openHover}
                        onLeave={closeSoon}
                        onViewportChange={close}
                        overlay={
                            entranceRandomized ||
                            forceSshdManualEntranceTestMode ? (
                                <button
                                    type="button"
                                    className={styles.entranceButton}
                                    aria-label="Entrances"
                                    title="Entrances"
                                    onClick={() => {
                                        close();
                                        onEntrances();
                                    }}
                                >
                                    <Icon name="door-open" />
                                </button>
                            ) : undefined
                        }
                        states={Object.fromEntries(
                            Object.entries(summaries).map(([id, summary]) => [
                                id,
                                map.markers.find((marker) => marker.id === id)
                                    ?.kind === 'link' &&
                                summary.status === 'empty'
                                    ? 'unavailable'
                                    : summary.status,
                            ]),
                        )}
                        counts={Object.fromEntries(
                            Object.entries(summaries).map(([id, summary]) => [
                                id,
                                summary.remaining,
                            ]),
                        )}
                    />
                </ResizableWorkspace>
            )}
            {!toolsOpen && (navigationNotice || notice) && (
                <div role="status" className={styles.bottomNotice}>
                    {navigationNotice || notice}
                </div>
            )}
            {hover &&
                hovered &&
                createPortal(
                    <MapHoverPanel
                        anchor={hover.anchor}
                        label={hovered.label}
                        onEnter={keepOpen}
                        onLeave={closeSoon}
                    >
                        {(hovered.kind === 'link' ||
                            hovered.showNameOnHover) && (
                            <div
                                className={`${styles.popupHeader} ${hovered.kind === 'checks' && hovered.note ? styles.headerWithNote : ''}`}
                            >
                                {hovered.kind === 'link' ? (
                                    <button
                                        type="button"
                                        className={styles.popupLinkTitle}
                                        onClick={() => {
                                            if (target) navigate(target);
                                            else {
                                                close();
                                                onEntrances(hovered.exitId);
                                            }
                                        }}
                                    >
                                        {hovered.label}
                                    </button>
                                ) : (
                                    <strong>{hovered.label}</strong>
                                )}
                                <button
                                    type="button"
                                    title="Close popup"
                                    aria-label="Close popup"
                                    onClick={close}
                                >
                                    <Icon name="times" />
                                </button>
                            </div>
                        )}
                        {hovered.kind === 'link' && hovered.exitId && (
                            <div
                                className={styles.linkConnection}
                                role="group"
                                aria-label="Entrance connection"
                            >
                                <span>
                                    {exits[hovered.exitId]?.entrance
                                        ? `Arrival: ${formatEntranceName(exits[hovered.exitId].entrance!.name)}${target ? ` · ${pack.maps.find((entry) => entry.id === target)?.name}` : ' · No map assigned'}`
                                        : 'Destination not mapped in Entrances'}
                                </span>
                                <button
                                    type="button"
                                    aria-label="Edit entrance connection"
                                    title="Edit entrance connection"
                                    onClick={() => {
                                        close();
                                        onEntrances(hovered.exitId);
                                    }}
                                >
                                    <Icon name="random" />
                                </button>
                            </div>
                        )}
                        {hovered.kind === 'checks' ? (
                            <CheckPopup
                                eras={pack.checkEras}
                                key={`${map.id}:${hovered.id}`}
                                marker={hovered}
                                active={active}
                                onEntrances={onEntrances}
                            />
                        ) : target ? (
                            <CheckPopup
                                eras={pack.checkEras}
                                key={`${map.id}:${hovered.id}`}
                                marker={{
                                    ...hovered,
                                    kind: 'checks',
                                    checkIds: mapCheckIds(pack, target ?? ''),
                                }}
                                active={active}
                                onEntrances={onEntrances}
                            />
                        ) : null}
                    </MapHoverPanel>,
                    window.document.body,
                )}
        </div>
    );
}
