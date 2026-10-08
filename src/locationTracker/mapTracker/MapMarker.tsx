import { type MouseEvent, useCallback } from 'react';
import type { TriggerEvent } from 'react-contexify';
import { useSelector } from 'react-redux';
import {
    draggableToRegionHint,
    useDroppable,
} from '../../dragAndDrop/DragAndDrop';
import { decodeHint } from '../../hints/Hints';
import { hintsToSubmarkers } from '../../hints/HintsParser';
import type { RootState } from '../../store/Store';
import {
    areaHintSelector,
    displayAreasSelector,
} from '../../tracker/Selectors';
import HintDescription from '../HintsDescription';
import type { LocationGroupContextMenuProps } from '../LocationGroupContextMenu';
import { useContextMenu } from '../context-menu';
import { useMapLayoutDebugEnabled } from './MapLayoutDebugMenuItems';
import { getMarkerColor, getRegionData, getSubmarkerData } from './MapUtils';
import { Marker } from './Marker';

function MapMarker({
    onGlickGroup,
    title,
    markerX,
    markerY,
    submarkerPlacement,
    selected,
    debugEnabled,
    debugPath,
    onDebugMove,
}: {
    markerX: number;
    markerY: number;
    submarkerPlacement: 'left' | 'right';
    title: string;
    onGlickGroup: (region: string) => void;
    selected: boolean;
    debugEnabled?: boolean;
    debugPath?: string;
    onDebugMove?: (debugPath: string, x: number, y: number) => void;
}) {
    const area = useSelector((state: RootState) =>
        displayAreasSelector(state).find((a) => a.name === title),
    );
    const data = area ? getRegionData(area) : undefined;
    const markerColor = data ? getMarkerColor(data.checks) : 'checked';

    const { show } = useContextMenu<LocationGroupContextMenuProps>({
        id: 'group-context',
    });
    const mapLayoutDebugEnabled = useMapLayoutDebugEnabled();

    const displayMenu = useCallback(
        (e: MouseEvent) => {
            if (area) {
                show({
                    event: e,
                    props: {
                        area: area.name,
                        layoutDebugPath:
                            mapLayoutDebugEnabled && debugPath
                                ? debugPath
                                : undefined,
                    },
                });
            }
        },
        [area, debugPath, mapLayoutDebugEnabled, show],
    );

    let hints = useSelector(areaHintSelector(title));

    const { setNodeRef, active, isOver } = useDroppable(
        area
            ? {
                  type: 'hintRegion',
                  hintRegion: area.name,
              }
            : undefined,
    );

    const dragPreviewHint = active && draggableToRegionHint(active);
    if (dragPreviewHint && isOver) {
        hints = [...hints, dragPreviewHint];
    }

    const tooltip = (
        <center>
            {data && (
                <div>
                    {title} ({data.checks.numAccessible}/
                    {data.checks.numRemaining})
                </div>
            )}
            {hints.map((hint, idx) => (
                <HintDescription key={idx} hint={decodeHint(hint)} />
            ))}
        </center>
    );

    const handleClick = (e: TriggerEvent) => {
        if (!area) {
            return;
        }
        if (e.type === 'contextmenu') {
            onGlickGroup(title);
            e.preventDefault();
        } else {
            onGlickGroup(title);
        }
    };

    return (
        <Marker
            ref={setNodeRef}
            x={markerX}
            y={markerY}
            variant="rounded"
            color={markerColor}
            tooltip={tooltip}
            onClick={handleClick}
            onContextMenu={displayMenu}
            selected={selected}
            debugEnabled={debugEnabled}
            debugPath={debugPath}
            onDebugMove={onDebugMove}
            submarkerPlacement={submarkerPlacement}
            previewStyle={
                dragPreviewHint ? (isOver ? 'hover' : 'droppable') : undefined
            }
            submarkers={[
                ...(data ? getSubmarkerData(data) : []),
                ...hintsToSubmarkers(hints),
            ]}
        >
            {Boolean(data?.checks.numAccessible) && data?.checks.numAccessible}
        </Marker>
    );
}

export default MapMarker;
