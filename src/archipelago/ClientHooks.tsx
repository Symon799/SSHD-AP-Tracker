import {
    createContext,
    useCallback,
    useContext,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { noop } from '../utils/Function';
import { APClientManager } from './Archipelago';

export const ClientManagerContext = createContext<APClientManager | null>(null);

export function MakeClientAvailable({ children }: { children: ReactNode }) {
    const [manager, _] = useState(() => new APClientManager());
    return (
        <ClientManagerContext value={manager}>{children}</ClientManagerContext>
    );
}

function useApManagerData<R>(fn: (manager: APClientManager) => R) {
    const clientManager = useContext(ClientManagerContext);
    const subscribe = useCallback(
        (cb: () => void) => clientManager?.subscribeToStatus(cb) ?? noop,
        [clientManager],
    );
    return useSyncExternalStore(subscribe, () => fn(clientManager!));
}

export const useApConnectionStatusString = () =>
    useApManagerData((manager) => manager.getStatusString());
export const useApConnectionStatus = () =>
    useApManagerData((manager) => manager.getStatus());
export const useApRequiredDungeonDiagnostic = () =>
    useApManagerData((manager) => manager.getRequiredDungeonDiagnostic());

export function useIsApConnected() {
    return useApConnectionStatus().state === 'loggedIn';
}
