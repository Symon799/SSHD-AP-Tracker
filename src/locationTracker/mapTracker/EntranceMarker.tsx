import { useCallback } from 'react';
import type { TriggerEvent } from 'react-contexify';
import { useSelector } from 'react-redux';
import type { ColorScheme } from '../../customization/ColorScheme';
import {
    draggableToRegionHint,
    useDroppable,
} from '../../dragAndDrop/DragAndDrop';
import { decodeHint } from '../../hints/Hints';
import { hintsToSubmarkers } from '../../hints/HintsParser';
import { logicSelector } from '../../logic/Selectors';
import type { RootState } from '../../store/Store';
import { useTooltipExpr } from '../../tooltips/TooltipHooks';
import {
    areaHintSelector,
    areasSelector,
    exitsByIdSelector,
    getRequirementLogicalStateSelector,
} from '../../tracker/Selectors';
import { useContextMenu } from '../context-menu';
import HintDescription from '../HintsDescription';
import type {
    LocationGroupContextMenuProps,
    MapExitContextMenuProps,
} from '../LocationGroupContextMenu';
import RequirementsTooltip from '../RequirementsTooltip';
import { useMapLayoutDebugEnabled } from './MapLayoutDebugMenuItems';
import { getMarkerColor, getRegionData, getSubmarkerData } from './MapUtils';
import { Marker } from './Marker';

function EntranceMarker({
    title,
    exitId,
    markerX,
    markerY,
    submarkerPlacement,
    active,
    onGlickGroup,
    onChooseEntrance,
    selected,
    debugEnabled,
    debugPath,
    onDebugMove,
}: {
    markerX: number;
    markerY: number;
    submarkerPlacement: 'left' | 'right';
    exitId: string;
    title: string;
    active: boolean;
    onGlickGroup: (group: string) => void;
    onChooseEntrance: (exitId: string) => void;
    selected: boolean;
    debugEnabled?: boolean;
    debugPath?: string;
    onDebugMove?: (debugPath: string, x: number, y: number) => void;
}) {
    const exit = useSelector(
        (state: RootState) => exitsByIdSelector(state)[exitId],
    );
    const getRequirementLogicalState = useSelector(
        getRequirementLogicalStateSelector,
    );
    const logic = useSelector(logicSelector);
    const isDungeon = Object.values(
        logic.areaGraph.linkedEntrancePools['dungeons'],
    ).some((ex) => ex.exits[0] === exit.exit.id);

    const region = exit.entrance?.region;
    const area = useSelector((state: RootState) =>
        areasSelector(state).find((r) => r.name === region),
    );

    const hasConnection = area !== undefined;
    const canReach = getRequirementLogicalState(exit.exit.id) === 'inLogic';
    const isUnrequiredDungeon =
        isDungeon &&
        exit.rule.type === 'random' &&
        Boolean(exit.rule.isKnownIrrelevant);

    const data = area && getRegionData(area);
    let markerColor: keyof ColorScheme;
    if (data) {
        markerColor = getMarkerColor(data.checks);
    } else if (canReach && !isUnrequiredDungeon) {
        markerColor = 'inLogic';
    } else {
        markerColor = 'checked';
    }

    const showBound = useContextMenu<MapExitContextMenuProps>({
        id: isDungeon
            ? isUnrequiredDungeon
                ? 'dungeon-unrequired-context'
                : 'dungeon-context'
            : 'trial-context',
    }).show;

    const showGroup = useContextMenu<LocationGroupContextMenuProps>({
        id: 'group-context',
    }).show;
    const mapLayoutDebugEnabled = useMapLayoutDebugEnabled();

    const destinationRegionName =
        exit.entrance && logic.areaGraph.entranceHintRegions[exit.entrance.id];

    const displayMenu = useCallback(
        (e: TriggerEvent) => {
            e.preventDefault();
            const layoutDebugPath =
                mapLayoutDebugEnabled && debugPath ? debugPath : undefined;
            if (!exit.canAssign) {
                if (exit.entrance) {
                    showGroup({
                        event: e,
                        props: {
                            area: exit.entrance?.region,
                            layoutDebugPath,
                        },
                    });
                }
            } else if (hasConnection) {
                showBound({
                    event: e,
                    props: {
                        exitMapping: exit,
                        area: destinationRegionName,
                        layoutDebugPath,
                    },
                });
            } else {
                onChooseEntrance(exitId);
            }
        },
        [
            debugPath,
            mapLayoutDebugEnabled,
            destinationRegionName,
            exit,
            exitId,
            hasConnection,
            onChooseEntrance,
            showBound,
            showGroup,
        ],
    );

    let hints = useSelector(areaHintSelector(destinationRegionName ?? ''));
    const {
        setNodeRef,
        active: draggableActive,
        isOver,
    } = useDroppable(
        destinationRegionName
            ? {
                  type: 'hintRegion',
                  hintRegion: destinationRegionName,
              }
            : undefined,
    );

    const dragPreviewHint =
        draggableActive &&
        destinationRegionName &&
        draggableToRegionHint(draggableActive);
    if (dragPreviewHint && isOver) {
        hints = [...hints, dragPreviewHint];
    }

    // Only calculate tooltip if this region is shown
    const requirements = useTooltipExpr(exit.exit.id, active);

    let tooltip;

    if (data) {
        tooltip = (
            <center>
                <div>{title}</div>
                <div>
                    ↳{region} ({data.checks.numAccessible}/
                    {data.checks.numRemaining})
                </div>
                <div style={{ textAlign: 'left' }}>
                    <RequirementsTooltip requirements={requirements} />
                </div>
                {hints.map((hint, idx) => (
                    <HintDescription key={idx} hint={decodeHint(hint)} />
                ))}
            </center>
        );
    } else {
        tooltip = (
            <center>
                <div>
                    {title} ({canReach ? 'Accessible' : 'Inaccessible'})
                </div>
                <div style={{ textAlign: 'left' }}>
                    <RequirementsTooltip requirements={requirements} />
                </div>
                <div>
                    ↳Click to Attach {isDungeon ? 'Dungeon' : 'Silent Realm'}
                </div>
            </center>
        );
    }

    const handleClick = (e: TriggerEvent) => {
        if (e instanceof KeyboardEvent && e.key !== ' ') {
            return;
        }
        if (e.type === 'contextmenu') {
            if (region) {
                onGlickGroup(region);
            }
            e.preventDefault();
        } else if (region) {
            onGlickGroup(region);
        } else {
            displayMenu(e);
        }
    };

    return (
        <Marker
            ref={setNodeRef}
            x={markerX}
            y={markerY}
            variant={title.includes('Trial Gate') ? 'circle' : 'square'}
            color={markerColor}
            tooltip={tooltip}
            onClick={handleClick}
            onContextMenu={displayMenu}
            selected={selected}
            debugEnabled={debugEnabled}
            debugPath={debugPath}
            onDebugMove={onDebugMove}
            previewStyle={
                dragPreviewHint ? (isOver ? 'hover' : 'droppable') : undefined
            }
            submarkerPlacement={submarkerPlacement}
            submarkers={
                data && [...getSubmarkerData(data), ...hintsToSubmarkers(hints)]
            }
        >
            {Boolean(data?.checks.numAccessible) && data?.checks.numAccessible}
            {!hasConnection && '?'}
        </Marker>
    );
}

export default EntranceMarker;
