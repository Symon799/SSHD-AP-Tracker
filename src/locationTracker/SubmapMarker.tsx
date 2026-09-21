import { useCallback } from 'react';
import type { TriggerEvent } from 'react-contexify';
import { useSelector } from 'react-redux';
import { decodeHint } from '../hints/Hints';
import { formatEntranceName } from '../logic/Entrances';
import { areaGraphSelector } from '../logic/Selectors';
import type { RootState } from '../store/Store';
import {
    areaHintSelector,
    areasSelector,
    checkSelector,
    exitsByIdSelector,
    settingSelector,
} from '../tracker/Selectors';
import HintDescription from './HintsDescription';
import { useContextMenu } from './context-menu';
import type { MapLayoutDebugContextMenuProps } from './mapTracker/MapLayoutDebugMenuItems';
import { useMapLayoutDebugEnabled } from './mapTracker/MapLayoutDebugMenuItems';
import type { MapHintRegion } from './mapTracker/MapModel';
import {
    combineRegionCounters,
    getMarkerColor,
    getRegionData,
    getSubmarkerData,
    initialRegionData,
} from './mapTracker/MapUtils';
import { Marker } from './mapTracker/Marker';

function SubmapHint({ area }: { area: string }) {
    const hints = useSelector(areaHintSelector(area));
    return hints.map((hint, idx) => (
        <HintDescription key={idx} hint={decodeHint(hint)} area={area} />
    ));
}

export function SubmapMarker({
    onSubmapChange,
    onChooseEntrance,
    provinceId,
    title,
    markerX,
    markerY,
    markers,
    currentRegionOrExit,
    debugEnabled,
    debugPath,
    onDebugMove,
}: {
    markerX: number;
    markerY: number;
    title: string;
    provinceId: string;
    onSubmapChange: (submap: string | undefined) => void;
    onChooseEntrance: (exitId: string) => void;
    markers: MapHintRegion[];
    currentRegionOrExit: string | undefined;
    debugEnabled?: boolean;
    debugPath?: string;
    onDebugMove?: (debugPath: string, x: number, y: number) => void;
}) {
    const areas = useSelector(areasSelector);
    const exits = useSelector(exitsByIdSelector);
    let data = initialRegionData();
    for (const marker of markers) {
        const area = areas.find((area) => area.name === marker.hintRegion);
        if (area) {
            data = combineRegionCounters(data, getRegionData(area));
        }
    }

    const areaGraph = useSelector(areaGraphSelector);

    let markerColor = getMarkerColor(data.checks);

    const birdSanityOn = useSelector(settingSelector('random-start-statues'));
    const birdStatueSanityPool =
        birdSanityOn && areaGraph.birdStatueSanity[title];
    const birdStatueExit =
        birdStatueSanityPool && exits[birdStatueSanityPool.exit];
    const needsBirdStatueSanityExit =
        birdStatueExit && birdStatueExit.entrance === undefined;
    const exitCheck = useSelector(
        (state: RootState) =>
            needsBirdStatueSanityExit &&
            checkSelector(birdStatueSanityPool.exit)(state),
    );

    if (
        exitCheck &&
        exitCheck.logicalState !== 'outLogic' &&
        data.checks.numAccessible === 0
    ) {
        markerColor = exitCheck.logicalState;
    }

    const tooltip = (
        <center>
            <div>
                {title} ({data.checks.numAccessible}/{data.checks.numRemaining})
            </div>
            <div>Click to Expand</div>
            {birdStatueExit && (
                <div>
                    {birdStatueExit.entrance
                        ? `↳${formatEntranceName(birdStatueExit.entrance.name)}`
                        : '↳Right-click to choose Starting Statue'}
                </div>
            )}
            {markers.map((marker, idx) =>
                marker.hintRegion ? (
                    <SubmapHint key={idx} area={marker.hintRegion} />
                ) : undefined,
            )}
        </center>
    );

    const birdStatueExitId = birdStatueSanityPool && birdStatueSanityPool.exit;

    const { show: showLayoutDebugMenu } =
        useContextMenu<MapLayoutDebugContextMenuProps>({
            id: 'map-layout-debug',
        });
    const mapLayoutDebugEnabled = useMapLayoutDebugEnabled();

    const displayMenu = useCallback(
        (e: TriggerEvent) => {
            e.preventDefault();
            if (mapLayoutDebugEnabled && debugPath) {
                showLayoutDebugMenu({
                    event: e,
                    props: { layoutDebugPath: debugPath },
                });
                return;
            }
            if (birdStatueExitId) {
                onChooseEntrance(birdStatueExitId);
            }
        },
        [
            birdStatueExitId,
            debugPath,
            mapLayoutDebugEnabled,
            onChooseEntrance,
            showLayoutDebugMenu,
        ],
    );

    const handleClick = (e: TriggerEvent | React.UIEvent) => {
        if (e.type === 'contextmenu') {
            e.preventDefault();
        } else {
            onSubmapChange(provinceId);
        }
    };

    return (
        <Marker
            x={markerX}
            y={markerY}
            variant={title.includes('Silent Realm') ? 'circle' : 'rounded'}
            color={markerColor}
            tooltip={tooltip}
            onClick={handleClick}
            onContextMenu={displayMenu}
            selected={currentRegionOrExit === birdStatueExitId}
            debugEnabled={debugEnabled}
            debugPath={debugPath}
            onDebugMove={onDebugMove}
            submarkerPlacement="right"
            submarkers={getSubmarkerData(data)}
        >
            {data.checks.numAccessible > 0
                ? data.checks.numAccessible
                : needsBirdStatueSanityExit
                  ? '?'
                  : ''}
        </Marker>
    );
}
