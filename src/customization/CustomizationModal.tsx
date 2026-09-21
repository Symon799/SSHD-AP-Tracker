import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Checkbox } from '../additionalComponents/Checkbox';
import { Dialog } from '../additionalComponents/Dialog';
import {
    MultiSelect,
    Select,
    type SelectValue,
} from '../additionalComponents/Select';
import Tooltip from '../additionalComponents/Tooltip';
import { isLogicLoadedSelector, optionsSelector } from '../logic/Selectors';
import { useAppDispatch } from '../store/Store';
import {
    type ColorScheme,
    darkColorScheme,
    lightColorScheme,
} from './ColorScheme';
import styles from './CustomizationModal.module.css';
import {
    autoRegionLoadingSelector,
    itemLayoutSelector,
    trickSemiLogicSelector,
    trickSemiLogicTrickListSelector,
} from './Selectors';
import {
    type ItemLayout,
    setAutoRegionLoading,
    setColorScheme,
    setEnabledSemilogicTricks,
    setItemLayout,
    setTrickSemiLogic,
} from './Slice';

const defaultColorSchemes = {
    Light: lightColorScheme,
    Dark: darkColorScheme,
};

const itemLayouts: SelectValue<ItemLayout>[] = [
    { value: 'inventory', payload: 'inventory', label: 'In-Game Inventory' },
    { value: 'grid', payload: 'grid', label: 'Grid Layout' },
];
function Setting({
    name,
    tooltip,
    children,
}: {
    name: string;
    tooltip?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={styles.setting}>
            <Tooltip content={tooltip ?? ''} disabled={!tooltip}>
                <div className={styles.header}>{name}</div>
            </Tooltip>
            <div className={styles.contents}>{children}</div>
        </div>
    );
}

export default function CustomizationModal({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const dispatch = useAppDispatch();
    const layout = useSelector(itemLayoutSelector);
    const trickSemiLogic = useSelector(trickSemiLogicSelector);
    const autoRegionLoading = useSelector(autoRegionLoadingSelector);
    const isLogicLoaded = useSelector(isLogicLoadedSelector);

    const updateColorScheme = useCallback(
        (scheme: ColorScheme) => dispatch(setColorScheme(scheme)),
        [dispatch],
    );

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title="Tracker Customization"
            className={styles.modal}
        >
            <Setting name="Item Tracker Settings">
                <Select
                    selectedValue={itemLayouts.find((l) => l.value === layout)}
                    onValueChange={(e) => e && dispatch(setItemLayout(e))}
                    options={itemLayouts}
                    label="Item Layout"
                />
            </Setting>
            <Setting
                name="Trick Logic"
                tooltip="Choose whether checks reachable only with tricks should be highlighted in a separate color, and which checks should be shown. An empty tricks list shows all tricks."
            >
                <div className={styles.labeledCheckbox}>
                    <Checkbox
                        id="trickLogic"
                        checked={trickSemiLogic}
                        onCheckedChange={(e) => dispatch(setTrickSemiLogic(e))}
                    />
                    <label htmlFor="trickLogic">Show Trick Logic</label>
                </div>
                {isLogicLoaded ? (
                    <TricksChooser enabled={trickSemiLogic} />
                ) : (
                    "Cannot customize tricks here because logic isn't loaded"
                )}
            </Setting>
            <Setting name="Additional Settings">
                <div className={styles.labeledCheckbox}>
                    <Checkbox
                        id="autoRegionChange"
                        checked={autoRegionLoading}
                        onCheckedChange={(e) =>
                            dispatch(setAutoRegionLoading(e))
                        }
                    />
                    <label htmlFor="autoRegionChange">
                        Automatically follow current region (AP)
                    </label>
                </div>
            </Setting>
            <Setting name="Presets">
                <div className={styles.colorPresets}>
                    {Object.entries(defaultColorSchemes).map(
                        ([key, scheme]) => (
                            <div key={key}>
                                <button
                                    type="button"
                                    className="tracker-button"
                                    style={{
                                        background: scheme.background,
                                        color: scheme.text,
                                        border: '1px solid var(--scheme-text)',
                                    }}
                                    onClick={() => updateColorScheme(scheme)}
                                >
                                    {key}
                                </button>
                            </div>
                        ),
                    )}
                </div>
            </Setting>
        </Dialog>
    );
}

function TricksChooser({ enabled }: { enabled: boolean }) {
    const dispatch = useDispatch();
    const options = useSelector(optionsSelector);
    const enabledTricks = useSelector(trickSemiLogicTrickListSelector);

    const onChange = useCallback(
        (tricks: string[]) => {
            dispatch(setEnabledSemilogicTricks(tricks));
        },
        [dispatch],
    );

    const choices = useMemo(
        () =>
            options
                .filter(
                    (o) =>
                        o.command === 'enabled-tricks-bitless' ||
                        o.command === 'enabled-tricks-glitched',
                )
                .flatMap((o) => (o.type === 'multichoice' ? o.choices : []))
                .map((o) => ({ value: o, payload: o, label: o })),
        [options],
    );

    const value = useMemo(
        () =>
            [...enabledTricks].map((o) => ({ value: o, payload: o, label: o })),
        [enabledTricks],
    );

    return (
        <MultiSelect<string>
            disabled={!enabled}
            selectedValue={value}
            onValueChange={onChange}
            options={choices}
            label="Enabled Tricks"
            searchable
            clearable={false}
        />
    );
}
