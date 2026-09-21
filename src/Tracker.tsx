import clsx from 'clsx';
import { useContext, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { Link, Navigate } from 'react-router-dom';
import {
    formatRequiredDungeonsDebugSummary,
    mergeApInventoryWithSeedItems,
} from './archipelago/Archipelago';
import {
    ClientManagerContext,
    useApConnectionStatus,
    useApConnectionStatusString,
    useApRequiredDungeonDiagnostic,
} from './archipelago/ClientHooks';
import { buildSshdApLocationResolver } from './archipelago/locationMapping';
import CustomizationModal from './customization/CustomizationModal';
import {
    autoRegionLoadingSelector,
    debugModeSelector,
} from './customization/Selectors';
import { setDebugMode } from './customization/Slice';
import stageToRegion from './data/stageToRegion.json';
import { DragAndDropContext } from './dragAndDrop/DragAndDrop';
import EntranceTracker from './entranceTracker/EntranceTracker';
import { TextClient } from './hints/TextClient';
import {
    ExportApServerDataButton,
    ExportTrackerStateButton,
    ExportUtSnapshotButton,
    ImportTrackerStateButton,
} from './ImportExport';
import { TrackerLayout } from './layouts/TrackerLayouts';
import LocationContextMenu from './locationTracker/LocationContextMenu';
import LocationGroupContextMenu from './locationTracker/LocationGroupContextMenu';
import {
    downloadLayoutOverrides,
    ENABLE_MAP_LAYOUT_DEBUG,
} from './locationTracker/mapTracker/layoutDebug';
import MapLayoutDebugContextMenu from './locationTracker/mapTracker/MapLayoutDebugContextMenu';
import { forceSshdManualEntranceTestMode } from './logic/EntranceTestMode';
import {
    areaGraphSelector,
    isLogicLoadedSelector,
    logicSelector,
} from './logic/Selectors';
import { getInitialItems } from './logic/TrackerModifications';
import type { RootState } from './store/Store';
import { MakeTooltipsAvailable } from './tooltips/TooltipHooks';
import styles from './Tracker.module.css';
import {
    exitsByIdSelector,
    hasManualEntranceMappingSelector,
    totalCountersSelector,
} from './tracker/Selectors';
import {
    replaceItemCounts,
    // clickDungeonName,
    setApGratitudeCrystalCounts,
    setApLocationCounts,
    syncApCheckedChecks,
    syncApRequiredDungeons,
    type TrackerState,
} from './tracker/Slice';
import { useTrackerInterfaceReducer } from './tracker/TrackerInterfaceReducer';
// import { requiredDungeonsSelector } from './tracker/Selectors';
// import type { RegularDungeon } from './logic/Locations';

export default function TrackerContainer() {
    const logicLoaded = useSelector(isLogicLoadedSelector);

    // If we haven't loaded logic yet, redirect to the main menu,
    // which will take care of loading logic for us.
    if (!logicLoaded) {
        return <Navigate to="/" />;
    }

    return (
        <MakeTooltipsAvailable>
            <DragAndDropContext>
                <Tracker />
            </DragAndDropContext>
        </MakeTooltipsAvailable>
    );
}

function Tracker() {
    const [activeView, setActiveView] = useState<'tracker' | 'server'>(
        'tracker',
    );
    const [showCustomizationDialog, setShowCustomizationDialog] =
        useState(false);

    return (
        <>
            <div className={styles.shell}>
                <div className={styles.mainArea}>
                    {activeView === 'tracker' ? (
                        <TrackerContents
                            openTools={() => setActiveView('server')}
                        />
                    ) : (
                        <TrackerToolsView
                            closeTools={() => setActiveView('tracker')}
                            openCustomization={() =>
                                setShowCustomizationDialog(true)
                            }
                        />
                    )}
                </div>
            </div>
            <CustomizationModal
                open={showCustomizationDialog}
                onOpenChange={setShowCustomizationDialog}
            />
        </>
    );
}

function TrackerContents({ openTools }: { openTools: () => void }) {
    const logic = useSelector(logicSelector);
    const areaGraph = useSelector(areaGraphSelector);
    const exitsById = useSelector(exitsByIdSelector);
    const hasManualEntranceMapping = useSelector(
        hasManualEntranceMappingSelector,
    );
    const [showEntranceDialog, setShowEntranceDialog] = useState(false);
    const [trackerInterfaceState, trackerInterfaceDispatch] =
        useTrackerInterfaceReducer();

    const autoRegionLoading = useSelector(autoRegionLoadingSelector);
    const dispatch = useDispatch();
    const store = useStore<RootState>();
    const clientManager = useContext(ClientManagerContext);
    const autoRegionLoadingRef = useRef(autoRegionLoading);
    autoRegionLoadingRef.current = autoRegionLoading;
    const entranceRandomizerEnabled =
        forceSshdManualEntranceTestMode || hasManualEntranceMapping;
    const goToEntrance = (exitId: string) => {
        const entranceId = exitsById[exitId]?.entrance?.id;
        const hintRegion = entranceId
            ? areaGraph.entranceHintRegions[entranceId]
            : undefined;
        if (hintRegion !== undefined) {
            trackerInterfaceDispatch({ type: 'selectHintRegion', hintRegion });
        }
    };
    const logicRef = useRef(logic);
    logicRef.current = logic;
    const seenUnmappedApLocations = useRef<Set<string>>(new Set());
    const autotrackedChecks = useRef<{
        locations: Set<string>;
    }>({
        locations: new Set(),
    });
    // const reqDungeons = useSelector(requiredDungeonsSelector);

    // Configure the AP client for auto-tracking
    useEffect(() => {
        if (clientManager === null) {
            return;
        }

        const apClient = clientManager;

        const clientLocationCallback = (locs: string[]) => {
            const resolveApLocation = buildSshdApLocationResolver(
                logicRef.current,
            );
            const mappedChecks: string[] = [];
            const newlyUnmappedLocations: string[] = [];

            for (const loc of locs) {
                const trackerCheck = resolveApLocation(loc);
                if (trackerCheck !== undefined) {
                    mappedChecks.push(trackerCheck);
                } else if (!seenUnmappedApLocations.current.has(loc)) {
                    seenUnmappedApLocations.current.add(loc);
                    newlyUnmappedLocations.push(loc);
                }
            }

            if (newlyUnmappedLocations.length > 0) {
                console.warn(
                    'Unmapped SSHD AP locations:',
                    newlyUnmappedLocations,
                );
            }
            autotrackedChecks.current.locations = new Set(mappedChecks);
            dispatch(syncApCheckedChecks(mappedChecks));
        };

        const clientCubeCallback = (cubeflags: number) => {
            // Legacy AP worlds may still send an auxiliary cube bitfield.
            // SSHD AP 0.6.x already exposes cube strikes as regular AP locations,
            // so checked_locations is the authoritative source and this callback
            // only remains as a harmless compatibility hook.
            void cubeflags;
        };

        const clientItemCallback = (inv: TrackerState['inventory']) => {
            const settings =
                apClient.getLoadedSettings() ??
                (store.getState().tracker.settings as Parameters<
                    typeof getInitialItems
                >[0]);
            const mergedInventory = mergeApInventoryWithSeedItems(
                getInitialItems(settings),
                inv,
            );
            dispatch(
                replaceItemCounts(
                    Object.entries(mergedInventory).map(([item, count]) => ({
                        item,
                        count: count ?? 0,
                    })),
                ),
            );
        };

        const stageCallback = (stage: string) => {
            if (!autoRegionLoadingRef.current) {
                return;
            }

            const region = stageToRegion[stage as keyof typeof stageToRegion];
            if (region !== undefined) {
                trackerInterfaceDispatch({
                    type: 'selectHintRegion',
                    hintRegion: region,
                });
            }
        };

        const requiredDungeonsCallback = (dungeons: string[]) => {
            dispatch(syncApRequiredDungeons({ dungeons }));
        };

        const locationStatsCallback = (stats: {
            total?: number;
            checked: number;
        }) => {
            dispatch(
                setApLocationCounts({
                    total: stats.total,
                    checked: stats.checked,
                }),
            );
        };

        const gratitudeCrystalCountsCallback = (
            counts: { singles: number; packs: number } | undefined,
        ) => {
            dispatch(setApGratitudeCrystalCounts(counts));
        };

        apClient.setLocationCallback(clientLocationCallback);
        apClient.setItemCallback(clientItemCallback);
        apClient.setNewStageCallback(stageCallback);
        apClient.setRequiredDungeonsCallback(requiredDungeonsCallback);
        apClient.setLocationStatsCallback(locationStatsCallback);
        apClient.setCubeCallback(clientCubeCallback);
        apClient.setGratitudeCrystalCountsCallback(
            gratitudeCrystalCountsCallback,
        );
        /* This will have to happen somewhere else to work properly
        if (clientManager !== undefined) {
            for (const dungeonName of clientManager!.requiredDungeons) {
                const dungeon = dungeonName as RegularDungeon;
                if (dungeon !== undefined && !reqDungeons.includes(dungeon)) {
                    dispatch(clickDungeonName({dungeonName: dungeon}));
                }
            }
        } */
    }, [clientManager, dispatch, store, trackerInterfaceDispatch]);

    return (
        <>
            <LocationContextMenu />
            <LocationGroupContextMenu
                interfaceDispatch={trackerInterfaceDispatch}
            />
            <MapLayoutDebugContextMenu />
            <div className={styles.trackerView}>
                <TrackerLayout
                    footerContent={<TrackerFooterNav openTools={openTools} />}
                    mapOverlayContent={
                        entranceRandomizerEnabled ? (
                            <button
                                type="button"
                                className={`${styles.entranceOverlayButton} tracker-button`}
                                onClick={() => setShowEntranceDialog(true)}
                                aria-label="Open Entrances"
                                title="Entrances"
                            >
                                <i
                                    className="fas fa-door-open"
                                    aria-hidden="true"
                                />
                            </button>
                        ) : undefined
                    }
                    interfaceDispatch={trackerInterfaceDispatch}
                    interfaceState={trackerInterfaceState}
                />
            </div>
            <EntranceTracker
                open={showEntranceDialog}
                onOpenChange={setShowEntranceDialog}
                onGoToExit={goToEntrance}
            />
        </>
    );
}

function TrackerToolsView({
    closeTools,
    openCustomization,
}: {
    closeTools: () => void;
    openCustomization: () => void;
}) {
    const dispatch = useDispatch();
    const debugMode = useSelector(debugModeSelector);
    const counters = useSelector(totalCountersSelector);
    const apLocationTotal = useSelector(
        (state: { tracker: TrackerState }) => state.tracker.apLocationTotal,
    );
    const requiredDungeonDiagnostic = useApRequiredDungeonDiagnostic();
    const locationTotal =
        apLocationTotal ?? counters.numChecked + counters.numRemaining;
    const completionPercent =
        locationTotal > 0
            ? ((counters.numChecked / locationTotal) * 100).toFixed(1)
            : '0.0';

    return (
        <div className={styles.toolsLayout}>
            <div className={styles.toolsSidebar}>
                <div className={styles.toolsOverviewCard}>
                    <div className={styles.toolsSection}>
                        <div className={styles.toolsTitle}>Session</div>
                        <div className={styles.sessionSummary}>
                            <div className={styles.sessionLine}>
                                Checked Locations: {counters.numChecked}
                            </div>
                            <div className={styles.sessionLine}>
                                Accessible Locations: {counters.numAccessible}
                            </div>
                            <div className={styles.sessionLine}>
                                Remaining Locations: {counters.numRemaining}
                            </div>
                            <div className={styles.sessionLine}>
                                Total Locations: {locationTotal}
                            </div>
                            <div className={styles.sessionLine}>
                                Completion: {completionPercent}%
                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.toolsCard}>
                    <div className={styles.toolsSection}>
                        <div className={styles.toolsTitle}>Tools</div>
                        <div className={styles.toolsButtons}>
                            <ExportTrackerStateButton />
                            <ImportTrackerStateButton />
                            <button
                                type="button"
                                className="tracker-button"
                                onClick={openCustomization}
                            >
                                Customization
                            </button>
                            {debugMode && (
                                <>
                                    <ExportUtSnapshotButton />
                                    <ExportApServerDataButton />
                                </>
                            )}
                            {ENABLE_MAP_LAYOUT_DEBUG && (
                                <button
                                    type="button"
                                    className="tracker-button"
                                    onClick={downloadLayoutOverrides}
                                >
                                    Export Map Layout
                                </button>
                            )}
                            <button
                                type="button"
                                className={clsx(
                                    'tracker-button',
                                    styles.toolsDebugToggle,
                                )}
                                onClick={() =>
                                    dispatch(setDebugMode(!debugMode))
                                }
                            >
                                {debugMode ? 'Debug On' : 'Debug Off'}
                            </button>
                        </div>
                    </div>
                </div>
                {debugMode && requiredDungeonDiagnostic && (
                    <div className={styles.toolsCard}>
                        <div className={styles.toolsSection}>
                            <div className={styles.toolsTitle}>Debug</div>
                            <div className={styles.debugStack}>
                                <div className={styles.debugLine}>
                                    <strong>Required dungeons:</strong>{' '}
                                    {formatRequiredDungeonsDebugSummary(
                                        requiredDungeonDiagnostic,
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <ToolsFooterNav closeTools={closeTools} />
            </div>
            <div className={styles.toolsLogPane}>
                <div className={styles.toolsLogHeader}>
                    <div className={styles.toolsTitle}>Server Log</div>
                    <div className={styles.logHeaderNote}>
                        Archipelago messages and commands
                    </div>
                </div>
                <div className={styles.logClientWrap}>
                    <TextClient />
                </div>
            </div>
        </div>
    );
}

function FooterStatusBlock({
    primaryAction,
    secondaryAction,
}: {
    primaryAction: React.ReactNode;
    secondaryAction: React.ReactNode;
}) {
    return (
        <div className={styles.footerNav}>
            <div className={styles.footerNavRow}>
                <div className={styles.footerNavButtons}>
                    {primaryAction}
                    {secondaryAction}
                </div>
                <TrackerStatusLine />
            </div>
        </div>
    );
}

function TrackerFooterNav({ openTools }: { openTools: () => void }) {
    return (
        <FooterStatusBlock
            primaryAction={
                <button
                    type="button"
                    className={`${styles.iconButton} tracker-button`}
                    onClick={openTools}
                    aria-label="Open Server and Tools"
                    title="Server & Tools"
                >
                    ⚙
                </button>
            }
            secondaryAction={
                <Link
                    to="/"
                    className={`${styles.footerLinkReset} ${styles.footerIconLink}`}
                    aria-label="Connect"
                    title="Connect"
                >
                    <div className={`${styles.iconButton} tracker-button`}>
                        🔌
                    </div>
                </Link>
            }
        />
    );
}

function ToolsFooterNav({ closeTools }: { closeTools: () => void }) {
    return (
        <FooterStatusBlock
            primaryAction={
                <button
                    type="button"
                    className={`${styles.iconButton} tracker-button`}
                    onClick={closeTools}
                    aria-label="Tracker"
                    title="Tracker"
                >
                    ▣
                </button>
            }
            secondaryAction={
                <Link
                    to="/"
                    className={`${styles.footerLinkReset} ${styles.footerIconLink}`}
                    aria-label="Connect"
                    title="Connect"
                >
                    <div className={`${styles.iconButton} tracker-button`}>
                        🔌
                    </div>
                </Link>
            }
        />
    );
}

function TrackerStatusLine() {
    const status = useApConnectionStatus();
    const statusString = useApConnectionStatusString();
    const shortStatus =
        status.state === 'loggedIn'
            ? `${status.serverName} as ${status.slotName}`
            : statusString;
    return <div className={styles.footerStatus}>{shortStatus}</div>;
}
