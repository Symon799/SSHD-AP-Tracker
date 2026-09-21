import clsx from 'clsx';
import { useCallback, type CSSProperties } from 'react';
import type { TriggerEvent } from 'react-contexify';
import { useDispatch, useSelector } from 'react-redux';
import Tooltip from '../additionalComponents/Tooltip';
import exitImg from '../assets/dungeons/entrance.png';
import goddessCubeImg from '../assets/sidequests/goddess_cube.png';
import gossipStoneImg from '../assets/sidequests/gossip_stone.png';
import { useDroppable } from '../dragAndDrop/DragAndDrop';
import { findRepresentativeIcon } from '../itemTracker/Images';
import { formatEntranceName } from '../logic/Entrances';
import type { InventoryItem } from '../logic/Inventory';
import type { Check } from '../logic/Locations';
import { isRegularItemCheck } from '../logic/Logic';
import { logicSelector } from '../logic/Selectors';
import { useAppDispatch, type RootState } from '../store/Store';
import {
    useEntrancePath,
    useTooltipDebug,
    useTooltipExpr,
} from '../tooltips/TooltipHooks';
import { clickCheck } from '../tracker/Actions';
import {
    checkHintSelector,
    checkSelector,
    exitsByIdSelector,
    isCheckBannedSelector,
} from '../tracker/Selectors';
import { mapEntrance } from '../tracker/Slice';
import keyDownWrapper from '../utils/KeyDownWrapper';
import { useContextMenu } from './context-menu';
import styles from './Location.module.css';
import PathTooltip from './PathTooltip';
import RequirementsTooltip from './RequirementsTooltip';

export interface LocationContextMenuProps {
    checkId: string;
}

export default function Location({
    compact,
    id,
    onChooseEntrance,
    onGoToEntrance,
    forceFullName = false,
}: {
    compact: boolean;
    id: string;
    onChooseEntrance: (exitId: string) => void;
    onGoToEntrance: (exitId: string) => void;
    forceFullName?: boolean;
}) {
    const check = useSelector(checkSelector(id));
    if (check.type === 'exit') {
        return (
            <Exit
                compact={compact}
                forceFullName={forceFullName}
                onChooseEntrance={onChooseEntrance}
                onGoToEntrance={onGoToEntrance}
                id={id}
            />
        );
    } else {
        return (
            <CheckLocation
                compact={compact}
                id={id}
                forceFullName={forceFullName}
            />
        );
    }
}

function CheckLocation({
    id,
    compact,
    forceFullName,
}: {
    id: string;
    compact: boolean;
    forceFullName: boolean;
}) {
    const dispatch = useAppDispatch();
    const isBanned = useSelector((state: RootState) =>
        isCheckBannedSelector(state)(id),
    );

    const check = useSelector(checkSelector(id));
    const logic = useSelector(logicSelector);
    const displayName =
        forceFullName && logic.checks[id]
            ? logic.checks[id].name
            : check.checkName;

    const onClick = () => dispatch(clickCheck({ checkId: id }));

    const style = {
        color: check.checked
            ? `var(--scheme-checked)`
            : `var(--scheme-${check.logicalState})`,
    } satisfies CSSProperties;

    const { show } = useContextMenu<LocationContextMenuProps>({
        id: 'location-context',
    });

    const displayMenu = useCallback(
        (e: TriggerEvent) => {
            show({ event: e, props: { checkId: id } });
        },
        [id, show],
    );

    const expr = useTooltipExpr(id);
    const debug = useTooltipDebug(id, expr);
    const path = useEntrancePath(id);
    const canAssignItemHint =
        check.type !== 'exit' && isRegularItemCheck(check.type);

    const { setNodeRef, active, isOver } = useDroppable(
        canAssignItemHint
            ? {
                  type: 'location',
                  checkId: id,
              }
            : undefined,
    );

    const draggedItem =
        active?.type === 'item' && canAssignItemHint ? active.item : undefined;

    return (
        <Tooltip
            content={
                <>
                    <RequirementsTooltip requirements={expr} />
                    {path && (
                        <>
                            <hr />
                            <PathTooltip segments={path} />
                        </>
                    )}
                    {debug && (
                        <>
                            <hr />
                            <div className={styles.debugBlock}>
                                <div className={styles.debugTitle}>
                                    Debug logic
                                </div>
                                <div>{`checkId: ${debug.checkId}`}</div>
                                <div>{`area: ${debug.area ?? 'unknown'}`}</div>
                                <div>{`checkBit: ${debug.checkBit ?? 'missing'}`}</div>
                                <div>{`inLogic path: ${debug.inLogicPathFound}`}</div>
                                <div>{`optimistic path: ${debug.optimisticPathFound}`}</div>
                                <div>{`start entrance: ${debug.startEntrance ?? 'unset'}`}</div>
                                <div>{`ER settings: dungeon=${String(debug.entranceSettings.randomizeDungeonEntrances)}, interior=${String(debug.entranceSettings.randomizeInteriorEntrances)}, overworld=${String(debug.entranceSettings.randomizeOverworldEntrances)}, trials=${String(debug.entranceSettings.randomizeTrialEntrances)}, legacy=${String(debug.entranceSettings.randomizeEntrances)}`}</div>
                                <div className={styles.debugSection}>
                                    Raw requirements:
                                </div>
                                {debug.rawStaticRequirements.map((line) => (
                                    <div
                                        key={line}
                                        className={styles.debugLine}
                                    >
                                        {line}
                                    </div>
                                ))}
                                <div className={styles.debugSection}>
                                    Static requirements:
                                </div>
                                {debug.staticRequirements.map((line) => (
                                    <div
                                        key={line}
                                        className={styles.debugLine}
                                    >
                                        {line}
                                    </div>
                                ))}
                                <div className={styles.debugSection}>
                                    Requirement states:
                                </div>
                                {debug.staticRequirementStates.map((line) => (
                                    <div
                                        key={line}
                                        className={styles.debugLine}
                                    >
                                        {line}
                                    </div>
                                ))}
                                {debug.relevantExits.length > 0 && (
                                    <>
                                        <div className={styles.debugSection}>
                                            Region exits:
                                        </div>
                                        {debug.relevantExits.map((line) => (
                                            <div
                                                key={line}
                                                className={styles.debugLine}
                                            >
                                                {line}
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                    {isBanned && (
                        <div className={styles.tooltipNote}>
                            This location is excluded by current settings and
                            will never be logically required.
                        </div>
                    )}
                </>
            }
        >
            <div
                className={clsx(styles.location, {
                    [styles.compact]: compact,
                    [styles.checked]: check.checked,
                    [styles.droppable]: Boolean(draggedItem),
                    [styles.droppableHover]: draggedItem && isOver,
                })}
                style={style}
                role="button"
                onClick={onClick}
                onKeyDown={keyDownWrapper(onClick)}
                onContextMenu={displayMenu}
                ref={setNodeRef}
            >
                <span className={styles.text}>{displayName}</span>
                <CheckIcon
                    check={check}
                    overrideHint={isOver ? draggedItem : undefined}
                    compact={compact}
                />
            </div>
        </Tooltip>
    );
}

function isGratitudeCrystalTrackerIcon(name: string) {
    return (
        name === 'Gratitude Crystal' ||
        name === 'Gratitude Crystal Pack' ||
        name === 'Gratitude Crystals'
    );
}

function gratitudeCrystalHintIcon() {
    return findRepresentativeIcon('Gratitude Crystals');
}

function hintIconForItem(hintItem: string) {
    if (isGratitudeCrystalTrackerIcon(hintItem)) {
        return gratitudeCrystalHintIcon();
    }
    return findRepresentativeIcon(hintItem);
}

function hintLabelForItem(hintItem: string) {
    if (isGratitudeCrystalTrackerIcon(hintItem)) {
        return 'Gratitude Crystals';
    }
    return hintItem;
}

function CheckIcon({
    check,
    overrideHint,
    compact,
}: {
    check: Check;
    overrideHint?: InventoryItem;
    compact?: boolean;
}) {
    let hintItem = useSelector(checkHintSelector(check.checkId));
    let preview = false;
    let name: string | undefined = undefined;
    let src: string | undefined = undefined;
    if (check.type === 'exit') {
        name = 'Exit';
        src = exitImg;
    } else if (check.type === 'gossip_stone') {
        name = 'Gossip Stone';
        src = gossipStoneImg;
    } else if (check.type === 'tr_cube') {
        name = 'Goddess Cube';
        src = goddessCubeImg;
    } else {
        if (overrideHint) {
            hintItem = overrideHint;
            preview = true;
        }
        if (hintItem) {
            name = hintLabelForItem(hintItem);
            src = hintIconForItem(hintItem);
        }
    }

    if (src && name) {
        return (
            <div
                className={clsx(styles.hintItem, { [styles.preview]: preview })}
            >
                <img
                    src={src}
                    height={compact ? 28 : 36}
                    title={name}
                    alt={name}
                />
            </div>
        );
    }
}

function Exit({
    compact,
    id,
    onChooseEntrance,
    onGoToEntrance,
    forceFullName,
    // setActiveArea,
}: {
    compact: boolean;
    id: string;
    onChooseEntrance: (exitId: string) => void;
    onGoToEntrance: (exitId: string) => void;
    forceFullName: boolean;
    // TODO
    // setActiveArea: (area: string) => void;
}) {
    const dispatch = useDispatch();
    const exit = useSelector(
        (state: RootState) => exitsByIdSelector(state)[id],
    );
    const check = useSelector(checkSelector(id));
    const displayName = formatEntranceName(
        forceFullName ? exit.exit.name : check.checkName,
    );

    const style = {
        color: check.checked
            ? `var(--scheme-checked)`
            : `var(--scheme-${check.logicalState})`,
    };

    const expr = useTooltipExpr(id);
    const path = useEntrancePath(id);

    const onClick = () => onChooseEntrance(id);

    return (
        <>
            <Tooltip
                content={
                    <>
                        <RequirementsTooltip requirements={expr} />
                        {path && (
                            <>
                                <hr />
                                <PathTooltip segments={path} />
                            </>
                        )}
                    </>
                }
            >
                <div
                    className={styles.location}
                    role="button"
                    onClick={onClick}
                    onKeyDown={keyDownWrapper(onClick)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        dispatch(
                            mapEntrance({
                                from: exit.exit.id,
                                to: undefined,
                            }),
                        );
                    }}
                >
                    <div className={clsx(styles.exit, styles.text)}>
                        <span style={style}>{displayName}</span>
                        <span>
                            ↳
                            {exit.entrance
                                ? formatEntranceName(exit.entrance.name)
                                : 'Select entrance...'}
                        </span>
                    </div>
                    <Tooltip content="Go to destination" placement="top">
                        <button
                            type="button"
                            className={styles.exitNavigationButton}
                            disabled={!exit.entrance}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (exit.entrance) {
                                    onGoToEntrance(id);
                                }
                            }}
                            aria-label="Go to destination"
                        >
                            <CheckIcon check={check} compact={compact} />
                        </button>
                    </Tooltip>
                </div>
            </Tooltip>
        </>
    );
}
