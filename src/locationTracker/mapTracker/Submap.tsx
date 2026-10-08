import type { TriggerEvent } from 'react-contexify';
import { useSelector } from 'react-redux';
import leaveEldin from '../../assets/maps/leaveEldin.png';
import leaveFaron from '../../assets/maps/leaveFaron.png';
import leaveLanayru from '../../assets/maps/leaveLanayru.png';
import leaveSkyloft from '../../assets/maps/leaveSkyloft.png';
import { debugModeSelector } from '../../customization/Selectors';
import { areaGraphSelector } from '../../logic/Selectors';
import keyDownWrapper from '../../utils/KeyDownWrapper';
import EntranceMarker from './EntranceMarker';
import {
    ENABLE_MAP_LAYOUT_DEBUG,
    MAP_LAYOUT_ROOT_ATTR,
    getLayoutOverride,
    setLayoutOverride,
} from './layoutDebug';
import MapMarker from './MapMarker';
import type { MapHintRegion } from './MapModel';

export type ExitParams = {
    image: string;
    width: number;
    left: number;
    top: number;
};

const images: Record<string, string> = {
    leaveSkyloft,
    leaveFaron,
    leaveEldin,
    leaveLanayru,
};

function Submap({
    onSubmapChange,
    onGroupChange,
    onChooseEntrance,
    provinceId,
    title,
    map,
    activeSubmap,
    markers,
    exitParams,
    currentRegionOrExit,
}: {
    title: string;
    provinceId: string;
    onGroupChange: (region: string | undefined) => void;
    onSubmapChange: (submap: string | undefined) => void;
    onChooseEntrance: (exitId: string) => void;
    markers: MapHintRegion[];
    activeSubmap: string | undefined;
    map: string;
    exitParams: ExitParams;
    currentRegionOrExit: string | undefined;
}) {
    const debugMode = useSelector(debugModeSelector);
    const areaGraph = useSelector(areaGraphSelector);
    const mapLayoutDebugEnabled = ENABLE_MAP_LAYOUT_DEBUG || debugMode;
    const applyOverride = (debugPath: string, x: number, y: number) =>
        setLayoutOverride(debugPath, { x, y });

    const handleBack = (e: TriggerEvent | React.UIEvent) => {
        if (e.type === 'contextmenu') {
            e.preventDefault();
            onSubmapChange(undefined);
        } else {
            onSubmapChange(undefined);
        }
    };

    return (
        <div
            {...{ [MAP_LAYOUT_ROOT_ATTR]: true }}
            style={{ position: 'relative' }}
        >
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <img
                src={map}
                alt={`${title} Map`}
                width="100%"
                style={{ position: 'relative' }}
                onContextMenu={handleBack}
                draggable={false}
            />
            {markers.map((marker) => {
                const position = getLayoutOverride(marker.debugPath, {
                    x: marker.markerX,
                    y: marker.markerY,
                });
                if (marker.type === 'hint_region') {
                    return (
                        <MapMarker
                            key={marker.hintRegion}
                            markerX={position.x}
                            markerY={position.y}
                            title={marker.hintRegion!}
                            submarkerPlacement={marker.supmarkerPlacement}
                            onGlickGroup={onGroupChange}
                            debugEnabled={mapLayoutDebugEnabled}
                            debugPath={marker.debugPath}
                            onDebugMove={applyOverride}
                            selected={
                                marker.hintRegion !== undefined &&
                                marker.hintRegion === currentRegionOrExit
                            }
                        />
                    );
                } else {
                    const exit = areaGraph.exits[marker.exitId];
                    if (!exit) {
                        return null;
                    }
                    return (
                        <EntranceMarker
                            key={marker.exitId}
                            markerX={position.x}
                            markerY={position.y}
                            title={exit.short_name}
                            active={provinceId === activeSubmap}
                            exitId={marker.exitId}
                            selected={
                                marker.exitId === currentRegionOrExit ||
                                (marker.hintRegion !== undefined &&
                                    marker.hintRegion === currentRegionOrExit)
                            }
                            submarkerPlacement={marker.supmarkerPlacement}
                            onGlickGroup={onGroupChange}
                            onChooseEntrance={onChooseEntrance}
                            debugEnabled={mapLayoutDebugEnabled}
                            debugPath={marker.debugPath}
                            onDebugMove={applyOverride}
                        />
                    );
                }
            })}
            <div
                onKeyDown={keyDownWrapper(handleBack)}
                onClick={handleBack}
                onContextMenu={handleBack}
                role="button"
                tabIndex={0}
            >
                <img
                    draggable={false}
                    alt="Back to Sky"
                    src={images[exitParams.image]}
                    width={`${exitParams.width}%`}
                    style={{
                        position: 'absolute',
                        left: `${exitParams.left}%`,
                        top: `${exitParams.top}%`,
                    }}
                />
            </div>
        </div>
    );
}

export default Submap;
