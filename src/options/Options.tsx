import clsx from 'clsx';
import {
    type Dispatch,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { useStore } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    ClientManagerContext,
    useApConnectionStatus,
    useApConnectionStatusString,
    useIsApConnected,
} from '../archipelago/ClientHooks';
import {
    getStoredArchipelagoServer,
    getStoredArchipelagoSlot,
    getStoredTrackerState,
    persistRootStateToLocalStorage,
    setStoredTrackerLaunchMode,
} from '../LocalStorage';
import { loadLogic } from '../logic/Slice';
import type { OptionDefs } from '../permalink/SettingsTypes';
import type { RootState } from '../store/Store';
import { useAppDispatch } from '../store/Store';
import { acceptSettings, loadTracker, reset } from '../tracker/Slice';
import Acknowledgement from './Acknowledgment';
import styles from './Options.module.css';
import {
    type LoadingState,
    type OptionsAction,
    useOptionsState,
} from './OptionsReducer';

const SSHD_REMOTE = { type: 'localSshd' } as const;

export default function Options() {
    const {
        counters,
        dispatch,
        loaded,
        loadingState,
        settings,
        selectedRemote,
    } = useOptionsState();
    const appDispatch = useAppDispatch();
    const store = useStore<RootState>();
    const clientManager = useContext(ClientManagerContext);
    const navigate = useNavigate();
    const isClientConnected = useIsApConnected();

    useEffect(() => {
        if (selectedRemote.type !== 'localSshd') {
            dispatch({ type: 'selectRemote', remote: SSHD_REMOTE });
        }
    }, [dispatch, selectedRemote.type]);

    const launch = useCallback(
        (shouldReset?: boolean) => {
            if (!loaded || !settings) {
                return;
            }
            if (!shouldReset && !isClientConnected) {
                return;
            }
            appDispatch(loadLogic(loaded));
            if (shouldReset) {
                setStoredTrackerLaunchMode('new');
                appDispatch(reset({ settings }));
                clientManager?.redeliverTrackerState();
                persistRootStateToLocalStorage(store.getState());
            } else {
                setStoredTrackerLaunchMode('continue');
                const stored = getStoredTrackerState();
                if (stored) {
                    appDispatch(loadTracker(stored));
                }
                appDispatch(acceptSettings({ settings }));
            }
            navigate('/tracker');
        },
        [
            appDispatch,
            clientManager,
            isClientConnected,
            loaded,
            navigate,
            settings,
            store,
        ],
    );

    return (
        <div className={styles.optionsPage}>
            <h1>
                Skyward Sword HD
                <br />
                Archipelago Tracker
            </h1>
            <ConnectionCard
                options={loaded?.options}
                dispatch={dispatch}
                loadingState={loadingState}
                counters={counters}
                launch={launch}
                clientConnected={isClientConnected}
                loaded={Boolean(loaded)}
            />
            <div className={clsx(styles.optionsCategory, styles.infoCard)}>
                <legend>About This Tracker</legend>
                <div className={styles.connectionNote}>
                    This is an auto map tracker for Skyward Sword HD Archipelago
                    only. Required dungeons sync automatically from the server
                    on SSHD AP versions above 0.7.3
                </div>
            </div>
            <hr />
            <Acknowledgement />
        </div>
    );
}

function LaunchButtons({
    loaded,
    counters,
    launch,
    clientConnected,
}: {
    loaded: boolean;
    counters:
        | { numChecked: number; numAccessible: number; numRemaining: number }
        | undefined;
    launch: (shouldReset?: boolean) => void;
    clientConnected: boolean;
}) {
    const canStart = loaded;
    const canResume = loaded && Boolean(counters) && clientConnected;

    const confirmLaunch = useCallback(
        (shouldReset?: boolean) => {
            const allow =
                !shouldReset ||
                (canStart &&
                    (!canResume ||
                        window.confirm(
                            'Reset your tracker and start a new run?',
                        )));
            if (allow) {
                launch(shouldReset);
            }
        },
        [canResume, canStart, launch],
    );

    return (
        <div className={styles.launchButtons}>
            <button
                type="button"
                className="tracker-button"
                disabled={!canResume}
                onClick={() => confirmLaunch()}
            >
                <span className={styles.continueButton}>
                    Continue Tracker
                    {counters && (
                        <span className={styles.counters}>
                            {`${counters.numChecked}/${counters.numRemaining}`}
                        </span>
                    )}
                </span>
            </button>
            <button
                type="button"
                className="tracker-button"
                disabled={!canStart || !clientConnected}
                onClick={() => confirmLaunch(true)}
            >
                Launch New Tracker
            </button>
        </div>
    );
}

function ConnectionCard({
    options,
    dispatch,
    loadingState,
    loaded,
    counters,
    launch,
    clientConnected,
}: {
    options: OptionDefs | undefined;
    dispatch: Dispatch<OptionsAction>;
    loadingState: LoadingState | undefined;
    loaded: boolean;
    counters:
        | { numChecked: number; numAccessible: number; numRemaining: number }
        | undefined;
    launch: (shouldReset?: boolean) => void;
    clientConnected: boolean;
}) {
    const storedServer = getStoredArchipelagoServer();
    const storedSlot = getStoredArchipelagoSlot();
    const clientManager = useContext(ClientManagerContext);
    const [server, setServer] = useState(
        storedServer ?? 'archipelago.gg:XXXXX',
    );
    const [inputSlot, setInputSlot] = useState(storedSlot ?? '');
    const [inputPassword, setInputPassword] = useState('');
    const apStatus = useApConnectionStatus();
    const apStatusString = useApConnectionStatusString();
    const isConnected = apStatus.state === 'loggedIn';
    const canConnect = options !== undefined && apStatus.state !== 'loggingIn';

    const connectToArchipelago = () => {
        if (!options) {
            return;
        }
        clientManager
            ?.login(server, inputSlot, inputPassword, options)
            .then((connected) => {
                if (connected) {
                    dispatch({
                        type: 'changeSettings',
                        settings: clientManager.getLoadedSettings()!,
                    });
                }
            });
    };

    const disconnectFromArchipelago = () => {
        clientManager?.resetClient();
    };

    return (
        <div className={clsx(styles.optionsCategory, styles.permalinkChooser)}>
            <legend>Connect</legend>
            <div
                className={clsx(
                    styles.permalinkInput,
                    isConnected && styles.permalinkInputLocked,
                )}
            >
                <input
                    type="text"
                    className="tracker-input"
                    disabled={isConnected}
                    readOnly={isConnected}
                    aria-readonly={isConnected}
                    title={
                        isConnected
                            ? 'Disconnect to edit the server address'
                            : undefined
                    }
                    placeholder="archipelago.gg:XXXXX"
                    value={server ?? ''}
                    onChange={(e) => setServer(e.target.value)}
                />
                <input
                    type="text"
                    className="tracker-input"
                    placeholder="Slot name"
                    disabled={isConnected}
                    readOnly={isConnected}
                    aria-readonly={isConnected}
                    title={
                        isConnected
                            ? 'Disconnect to edit the slot name'
                            : undefined
                    }
                    value={
                        apStatus.state === 'loggedIn'
                            ? apStatus.slotName
                            : inputSlot || ''
                    }
                    onChange={(e) => setInputSlot(e.target.value)}
                />
                <input
                    type="text"
                    className="tracker-input"
                    placeholder="Password (optional)"
                    disabled={isConnected}
                    readOnly={isConnected}
                    aria-readonly={isConnected}
                    title={
                        isConnected
                            ? 'Disconnect to change the password'
                            : undefined
                    }
                    value={inputPassword}
                    onChange={(e) => setInputPassword(e.target.value)}
                />
            </div>
            <div className={styles.connectionStatus}>
                {apStatus.state === 'loggedOut' && !apStatus.error
                    ? 'Connect to Archipelago to load the SSHD seed settings.'
                    : apStatusString}
            </div>
            <div className={styles.connectionToolbar}>
                <div className={styles.connectionActions}>
                    <button
                        type="button"
                        className="tracker-button"
                        disabled={!canConnect}
                        onClick={connectToArchipelago}
                    >
                        Connect
                    </button>
                    <button
                        type="button"
                        className="tracker-button"
                        disabled={
                            !isConnected && apStatus.state !== 'loggingIn'
                        }
                        onClick={disconnectFromArchipelago}
                    >
                        Disconnect
                    </button>
                </div>
                <LaunchButtons
                    counters={counters}
                    loaded={loaded}
                    launch={launch}
                    clientConnected={clientConnected}
                />
            </div>
            {loadingState?.type === 'loading' && (
                <LoadingStateIndicator loadingState={loadingState} />
            )}
        </div>
    );
}

function LoadingStateIndicator({
    loadingState,
}: {
    loadingState: LoadingState | undefined;
}) {
    return (
        <div className={styles.loadingState}>
            <span>
                {loadingState?.type === 'loading'
                    ? 'Loading SSHD logic...'
                    : loadingState
                      ? `❌ ${loadingState.error}`
                      : 'SSHD logic ready'}
            </span>
        </div>
    );
}
