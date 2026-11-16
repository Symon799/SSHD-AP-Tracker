import { useState, type ReactNode } from 'react';
import { Provider, useStore } from 'react-redux';
import { useIsApConnected } from '../archipelago/ClientHooks';
import { createStore, type Store } from '../store/Store';
import { MakeTooltipsAvailable } from '../tooltips/TooltipHooks';
import { reset } from '../tracker/Slice';
import {
    offlinePresets,
    offlineSettings,
    type OfflinePreset,
} from './offlinePresets';

export default function OfflinePreview({
    children,
}: {
    children: (control: ReactNode, preview: boolean) => ReactNode;
}) {
    const live = useStore() as Store;
    const connected = useIsApConnected();
    const [preview, setPreview] = useState<{
        store: Store;
        preset: OfflinePreset;
    }>();
    const control = connected ? null : (
        <select
            aria-label="Offline preset"
            value={preview?.preset ?? 'saved'}
            onChange={(event) => {
                if (event.target.value === 'saved') {
                    setPreview(undefined);
                    return;
                }
                const preset = event.target.value as OfflinePreset;
                const state = live.getState();
                if (!state.logic.loaded) return;
                const store = createStore(state);
                store.dispatch(
                    reset({
                        settings: offlineSettings(
                            state.logic.loaded.options,
                            preset,
                        ),
                    }),
                );
                setPreview({ store, preset });
            }}
        >
            <option value="saved">Saved settings / defaults</option>
            {offlinePresets.map(([value, label]) => (
                <option key={value} value={value}>
                    {label}
                </option>
            ))}
        </select>
    );
    return (
        <Provider store={connected ? live : (preview?.store ?? live)}>
            <MakeTooltipsAvailable>
                {children(control, !connected && Boolean(preview))}
            </MakeTooltipsAvailable>
        </Provider>
    );
}
