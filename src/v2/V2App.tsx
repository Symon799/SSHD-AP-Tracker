import { useEffect, useMemo, useState } from 'react';
import { useSelector, useStore } from 'react-redux';
import { Route, Routes } from 'react-router-dom';
import { DragAndDropContext } from '../dragAndDrop/DragAndDrop';
import EntranceTracker from '../entranceTracker/EntranceTracker';
import { loadRemoteLogic } from '../loader/LogicLoader';
import { isLogicLoadedSelector, logicSelector } from '../logic/Selectors';
import { loadLogic } from '../logic/Slice';
import Options from '../options/Options';
import { defaultSettings } from '../permalink/Settings';
import { type RootState, useAppDispatch } from '../store/Store';
import { MakeTooltipsAvailable } from '../tooltips/TooltipHooks';
import { TrackerContents } from '../Tracker';
import { exitsByIdSelector } from '../tracker/Selectors';
import { acceptSettings } from '../tracker/Slice';
import { loadDefaultDocument } from './defaultPack';
import { applyDefaultPackEntrances } from './defaultPackEntrances';
import { useMapDocument } from './documentStore';
import OfflinePreview from './OfflinePreview';
import type { MapDocument } from './pack';
import PackEditor from './PackEditor';
import PackViewer from './PackViewer';
import styles from './v2.module.css';

function Workspace({ initial }: { initial: MapDocument }) {
    const { areaGraph } = useSelector(logicSelector);
    const defaultDocument = useMemo(
        () => ({
            ...initial,
            pack: applyDefaultPackEntrances(initial.pack, areaGraph),
        }),
        [initial, areaGraph],
    );
    const store = useMapDocument(defaultDocument);
    const [entrancesOpen, setEntrancesOpen] = useState(false);
    const [requestedExit, setRequestedExit] = useState<string>();
    const openEntrances = (exitId?: string) => {
        setRequestedExit(exitId);
        setEntrancesOpen(true);
    };
    const exits = useSelector(exitsByIdSelector);
    const [requestedMap, setRequestedMap] = useState<{ id: string }>();
    const [notice, setNotice] = useState('');
    const goToExit = (id: string) => {
        const entrance = exits[id]?.entrance?.id;
        const target = store.document.pack.maps.find((map) =>
            map.entranceIds.includes(entrance ?? ''),
        );
        if (target) {
            setRequestedMap({ id: target.id });
            setNotice('');
        } else
            setNotice(
                'This destination has no map placement in the current pack.',
            );
        setEntrancesOpen(false);
    };
    if (!store.ready)
        return (
            <div className={styles.app}>
                <p>Loading map pack…</p>
            </div>
        );
    return (
        <MakeTooltipsAvailable>
            <DragAndDropContext>
                <Routes>
                    <Route
                        path="connect"
                        element={<Options trackerPath="/v2" />}
                    />
                    <Route
                        path="editor"
                        element={
                            <PackEditor
                                store={store}
                                defaultDocument={defaultDocument}
                            />
                        }
                    />
                    <Route
                        path="*"
                        element={
                            <OfflinePreview>
                                {(presetControl, preview) => (
                                    <>
                                        <TrackerContents
                                            syncArchipelago={!preview}
                                            openTools={() =>
                                                setEntrancesOpen(true)
                                            }
                                            renderLayout={
                                                <PackViewer
                                                    document={store.document}
                                                    onEntrances={openEntrances}
                                                    requestedMap={requestedMap}
                                                    notice={notice}
                                                    trackingPaused={
                                                        entrancesOpen
                                                    }
                                                    presetControl={
                                                        presetControl
                                                    }
                                                />
                                            }
                                        />
                                        <EntranceTracker
                                            open={entrancesOpen}
                                            onOpenChange={setEntrancesOpen}
                                            onGoToExit={goToExit}
                                            initialExitId={requestedExit ?? ''}
                                        />
                                    </>
                                )}
                            </OfflinePreview>
                        }
                    />
                </Routes>
            </DragAndDropContext>
        </MakeTooltipsAvailable>
    );
}

export default function V2App() {
    const loaded = useSelector(isLogicLoadedSelector);
    const dispatch = useAppDispatch();
    const store = useStore<RootState>();
    const [error, setError] = useState('');
    const [initial, setInitial] = useState<MapDocument>();
    useEffect(() => {
        let active = true;
        loadDefaultDocument()
            .then((document) => {
                if (active) setInitial(document);
            })
            .catch((cause: unknown) => {
                if (active) setError(String(cause));
            });
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        if (loaded) return;
        let active = true;
        loadRemoteLogic({ type: 'localSshd' })
            .then(([logic, options, presets, remoteName]) => {
                if (!active) return;
                dispatch(
                    loadLogic({
                        logic,
                        options,
                        presets,
                        remote: { type: 'localSshd' },
                        remoteName,
                    }),
                );
                dispatch(
                    acceptSettings({
                        settings: {
                            ...defaultSettings(options),
                            ...store.getState().tracker.settings,
                        },
                    }),
                );
            })
            .catch((cause: unknown) => {
                if (active) setError(String(cause));
            });
        return () => {
            active = false;
        };
    }, [loaded, dispatch, store]);
    if (!loaded || !initial)
        return (
            <div className={styles.app}>
                <p role="status">
                    {error ||
                        (!loaded
                            ? 'Loading SSHD catalogue…'
                            : 'Loading default map pack…')}
                </p>
            </div>
        );
    return <Workspace initial={initial} />;
}
