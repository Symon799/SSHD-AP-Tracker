import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { formatEntranceName } from '../logic/Entrances';
import {
    entrancePoolsSelector,
    exitsByIdSelector,
    usedEntrancesSelector,
} from '../tracker/Selectors';
import { mapEntrance } from '../tracker/Slice';
import { emptyArray } from '../utils/Collections';
import keyDownWrapper from '../utils/KeyDownWrapper';
import styles from './EntranceChooser.module.css';
import locationStyles from './Location.module.css';
import LocationGrid from './LocationGrid';

const RESET_OPTION = 'RESET';

export default function EntranceChooser({
    wide,
    exitId,
    onChoose,
    onCancel,
}: {
    wide: boolean;
    exitId: string;
    onChoose: (entranceId: string | undefined) => void;
    onCancel: () => void;
}) {
    const dispatch = useDispatch();
    const exits = useSelector(exitsByIdSelector);
    const entrancePools = useSelector(entrancePoolsSelector);
    const usedEntrances = useSelector(usedEntrancesSelector);
    const exit = exits[exitId];

    const [filterText, setFilterText] = useState('');

    const matches = (name: string, searchString: string) => {
        if (!searchString) {
            return true;
        }
        const fragments = searchString.split(' ');
        return fragments.every((fragment) => name.includes(fragment.trim()));
    };

    const entranceOptions = useMemo(() => {
        if (exit.canAssign) {
            const pool = exit.rule.pool;
            const entrances = entrancePools[pool].entrances
                .filter(
                    (entrance) =>
                        !entrancePools[pool].usedEntrancesExcluded ||
                        !usedEntrances[pool].includes(entrance.id),
                )
                .filter(({ name }) =>
                    matches(name.toLowerCase(), filterText.toLowerCase()),
                )
                .map(({ id, name }) => ({
                    value: id,
                    label: formatEntranceName(name),
                }));

            if (exit.entrance) {
                entrances.unshift({ value: RESET_OPTION, label: 'Reset' });
            }

            return entrances;
        }
    }, [
        entrancePools,
        exit.canAssign,
        exit.entrance,
        exit.rule,
        filterText,
        usedEntrances,
    ]);

    const onClickEntrance = (value: string) => {
        if (value === RESET_OPTION) {
            dispatch(mapEntrance({ from: exitId, to: undefined }));
        } else {
            dispatch(mapEntrance({ from: exitId, to: value }));
        }
        onChoose(value === RESET_OPTION ? undefined : value);
    };

    return (
        <div className={styles.entranceChooser}>
            <span className={styles.query}>
                Where does {formatEntranceName(exit.exit.name)} lead to?
            </span>
            <div className={styles.filterRow}>
                <button
                    type="button"
                    className="tracker-button"
                    onClick={onCancel}
                    title="Cancel entrance selection"
                    aria-label="Cancel entrance selection"
                >
                    ←
                </button>
                <input
                    className="tracker-input"
                    placeholder="Filter entrances..."
                    autoFocus
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                />
            </div>
            <div className={styles.entrances}>
                <LocationGrid compact={false} wide={wide}>
                    {entranceOptions?.map(({ value, label }) => (
                        <div
                            key={value}
                            className={locationStyles.location}
                            role="button"
                            onClick={() => onClickEntrance(value)}
                            onKeyDown={keyDownWrapper(() =>
                                onClickEntrance(value),
                            )}
                        >
                            <span className={locationStyles.text}>{label}</span>
                        </div>
                    )) ?? emptyArray()}
                </LocationGrid>
            </div>
        </div>
    );
}
