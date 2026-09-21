import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { ColorScheme } from './customization/ColorScheme';
import type { CustomizationState, ItemLayout } from './customization/Slice';
import {
    type RemoteReference,
    formatRemote,
    parseRemote,
} from './loader/LogicLoader';
import type { SavesState } from './saves/Slice';
import type { RootState } from './store/Store';
import type { TrackerState } from './tracker/Slice';

const trackerStateLocalStorageKey = 'ssrTrackerState';
const customizationStateLocalStorageKey = 'ssrTrackerCustomization';
const remoteLogicLocalStorageKey = 'ssrTrackerRemoteLogic';
const savesLocalStorageKey = 'ssrTrackerSaves';
const archipelagoServerLocalStorageKey = 'archipelagoServer';
const archipelagoSlotLocalStorageKey = 'archipelagoSlot';
const trackerSidebarWidthLocalStorageKey = 'sshdTrackerSidebarWidth';
const trackerMapHeightLocalStorageKey = 'sshdTrackerMapHeight';
const trackerListPanelHeightLocalStorageKey = 'sshdTrackerListPanelHeight';
const trackerLocationFilterLocalStorageKey = 'sshdTrackerLocationFilter';

// Legacy
const itemLayoutLocalStorageKey = 'ssrTrackerLayout';
const colorSchemeLocalStorageKey = 'ssrTrackerColorScheme';
const trickSemilogicLocalStorageKey = 'ssrTrackerTrickLogic';

export type TrackerLaunchMode = 'continue' | 'new';

const trackerLaunchModeSessionKey = 'sshdTrackerLaunchMode';

export function setStoredTrackerLaunchMode(mode: TrackerLaunchMode) {
    sessionStorage.setItem(trackerLaunchModeSessionKey, mode);
}

export function getStoredTrackerLaunchMode(): TrackerLaunchMode {
    return sessionStorage.getItem(trackerLaunchModeSessionKey) === 'new'
        ? 'new'
        : 'continue';
}

export function persistRootStateToLocalStorage(state: RootState) {
    localStorage.setItem(
        trackerStateLocalStorageKey,
        JSON.stringify(state.tracker),
    );
    const { debugMode: _debugMode, ...customizationToPersist } =
        state.customization;
    localStorage.setItem(
        customizationStateLocalStorageKey,
        JSON.stringify(customizationToPersist),
    );
    if (state.logic.loaded) {
        localStorage.setItem(
            remoteLogicLocalStorageKey,
            JSON.stringify(state.logic.loaded.remote),
        );
    }
}

export function useSyncTrackerStateToLocalStorage() {
    const rawRemote = useSelector(
        (state: RootState) => state.logic.loaded?.remote,
    );
    const trackerState = useSelector((state: RootState) => state.tracker);
    const customizationState = useSelector(
        (state: RootState) => state.customization,
    );

    useEffect(() => {
        localStorage.setItem(
            trackerStateLocalStorageKey,
            JSON.stringify(trackerState),
        );
    }, [trackerState]);

    useEffect(() => {
        if (rawRemote === undefined) {
            return;
        }
        localStorage.setItem(
            remoteLogicLocalStorageKey,
            JSON.stringify(rawRemote),
        );
    }, [rawRemote]);

    useEffect(() => {
        const { debugMode: _debugMode, ...customizationToPersist } =
            customizationState;
        localStorage.setItem(
            customizationStateLocalStorageKey,
            JSON.stringify(customizationToPersist),
        );
    }, [customizationState]);
}

export function useSyncSavesToLocalStorage() {
    const saves = useSelector((state: RootState) => state.saves);

    useEffect(() => {
        localStorage.setItem(savesLocalStorageKey, JSON.stringify(saves));
    }, [saves]);
}

export function getStoredTrackerState(): Partial<TrackerState> | undefined {
    const stateJson = localStorage.getItem(trackerStateLocalStorageKey);
    return stateJson
        ? (JSON.parse(stateJson) as Partial<TrackerState>)
        : undefined;
}

const logicMigrations: Record<string, string> = {
    'robojumper/logic-dump': 'robojumper/logic-v2.1.1',
    'robojumper/statuesanity': 'ssrando/main',
    'YourAverageLink/random-pillar-statue': 'ssrando/main',
};

export function getStoredCustomization(): Partial<
    Omit<CustomizationState, 'colorScheme'> & {
        colorScheme: Partial<ColorScheme>;
    }
> {
    const entireCustomization = localStorage.getItem(
        customizationStateLocalStorageKey,
    );
    let state: ReturnType<typeof getStoredCustomization> = {};
    if (entireCustomization) {
        state = JSON.parse(entireCustomization) as Partial<CustomizationState>;
    } else {
        state = {
            itemLayout: getStoredItemLayout(),
            colorScheme: getStoredColorScheme(),
            trickSemilogic: getStoredTrickSemiLogic(),
        };
    }

    // Remove undefined properties so that merging works in users of this
    for (const [key, value] of Object.entries(state)) {
        if (value === undefined) {
            delete state[key as keyof typeof state];
        }
    }

    return state;
}

export function getStoredRemote(): RemoteReference | undefined {
    const storedRemote = localStorage.getItem(remoteLogicLocalStorageKey);
    if (storedRemote === null) {
        return undefined;
    }
    const theRemote = JSON.parse(storedRemote) as RemoteReference;
    const migration = logicMigrations[formatRemote(theRemote)];
    if (migration) {
        return parseRemote(migration)!;
    } else {
        return theRemote;
    }
}

export function clearStoredRemote() {
    localStorage.removeItem(remoteLogicLocalStorageKey);
}

export function getStoredSaves(): Partial<SavesState> | undefined {
    const saves = localStorage.getItem(savesLocalStorageKey);
    return saves ? (JSON.parse(saves) as SavesState) : undefined;
}

export function getStoredArchipelagoServer(): string | null {
    return localStorage.getItem(archipelagoServerLocalStorageKey);
}

export function setStoredArchipelagoServer(server: string) {
    localStorage.setItem(archipelagoServerLocalStorageKey, server);
}

export function getStoredArchipelagoSlot(): string | null {
    return localStorage.getItem(archipelagoSlotLocalStorageKey);
}

export function setStoredArchipelagoSlot(slot: string) {
    localStorage.setItem(archipelagoSlotLocalStorageKey, slot);
}

export function getStoredTrackerSidebarWidth(): number | undefined {
    const value = localStorage.getItem(trackerSidebarWidthLocalStorageKey);
    return value ? Number(value) : undefined;
}

export function setStoredTrackerSidebarWidth(width: number) {
    localStorage.setItem(trackerSidebarWidthLocalStorageKey, String(width));
}

export function getStoredTrackerMapHeight(): number | undefined {
    const value = localStorage.getItem(trackerMapHeightLocalStorageKey);
    return value ? Number(value) : undefined;
}

export function setStoredTrackerMapHeight(height: number) {
    localStorage.setItem(trackerMapHeightLocalStorageKey, String(height));
}

export function getStoredTrackerListPanelHeight(): number | undefined {
    const value = localStorage.getItem(trackerListPanelHeightLocalStorageKey);
    return value ? Number(value) : undefined;
}

export function setStoredTrackerListPanelHeight(height: number) {
    localStorage.setItem(trackerListPanelHeightLocalStorageKey, String(height));
}

export type TrackerLocationFilter = 'all' | 'accessible' | 'checked';

export function getStoredTrackerLocationFilter():
    | TrackerLocationFilter
    | undefined {
    const value = localStorage.getItem(trackerLocationFilterLocalStorageKey);
    return value === 'all' || value === 'accessible' || value === 'checked'
        ? value
        : undefined;
}

export function setStoredTrackerLocationFilter(filter: TrackerLocationFilter) {
    localStorage.setItem(trackerLocationFilterLocalStorageKey, filter);
}

// Legacy

function getStoredItemLayout(): ItemLayout | undefined {
    const itemLayout = localStorage.getItem(
        itemLayoutLocalStorageKey,
    ) as ItemLayout | null;
    return itemLayout ?? undefined;
}

function getStoredColorScheme(): Partial<ColorScheme> | undefined {
    const schemeJson = localStorage.getItem(colorSchemeLocalStorageKey);
    return schemeJson
        ? (JSON.parse(schemeJson) as Partial<ColorScheme>)
        : undefined;
}

function getStoredTrickSemiLogic(): boolean | undefined {
    const schemeJson = localStorage.getItem(trickSemilogicLocalStorageKey);
    return schemeJson ? (JSON.parse(schemeJson) as boolean) : undefined;
}
