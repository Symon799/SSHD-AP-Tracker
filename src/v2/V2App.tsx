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
import { demoDocument } from './demo';
import { useMapDocument } from './documentStore';
import { legacyDocument } from './legacyPack';
import PackEditor from './PackEditor';
import PackViewer from './PackViewer';
import styles from './v2.module.css';

function Workspace() {
    const logic = useSelector(logicSelector);
    const initial = useMemo(() => legacyDocument(logic), [logic]);
    const previous = useMemo(() => demoDocument(logic).pack, [logic]);
    const store = useMapDocument(initial, previous);
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
                        element={<PackEditor store={store} />}
                    />
                    <Route
                        path="*"
                        element={
                            <>
                                <TrackerContents
                                    openTools={() => setEntrancesOpen(true)}
                                    renderLayout={
                                        <PackViewer
                                            document={store.document}
                                            onEntrances={openEntrances}
                                            requestedMap={requestedMap}
                                            notice={notice}
                                            trackingPaused={entrancesOpen}
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
    if (!loaded)
        return (
            <div className={styles.app}>
                <p role="status">{error || 'Loading SSHD catalogue…'}</p>
            </div>
        );
    return <Workspace />;
}
