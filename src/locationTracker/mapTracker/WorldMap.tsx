import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import eldinMap from '../../assets/maps/Eldin.png';
import faronMap from '../../assets/maps/Faron.png';
import lanayruMap from '../../assets/maps/Lanayru.png';
import skyMap from '../../assets/maps/Sky.png';
import skyloftMap from '../../assets/maps/Skyloft.png';
import { debugModeSelector } from '../../customization/Selectors';
import mapData from '../../data/mapData.json';
import type { HintRegion } from '../../logic/Locations';
import {
    OTHERS_HINT_REGION,
    displayAreasSelector,
    unmappedAreaNamesSelector,
} from '../../tracker/Selectors';
import type {
    InterfaceAction,
    InterfaceState,
} from '../../tracker/TrackerInterfaceReducer';
import { SubmapMarker } from '../SubmapMarker';
import {
    ENABLE_MAP_LAYOUT_DEBUG,
    MAP_LAYOUT_ROOT_ATTR,
    getLayoutOverride,
    registerLayoutDebugHelpers,
    setLayoutOverride,
    subscribeLayoutOverrides,
} from './layoutDebug';
import MapMarker from './MapMarker';
import { mapModelSelector } from './Selectors';
import StartingEntranceMarker from './StartingEntranceMarker';
import Submap from './Submap';

const images: Record<string, string> = {
    skyloftMap,
    faronMap,
    eldinMap,
    lanayruMap,
};

const imagesToPrefetch = [...Object.values(images), skyMap];

export const WORLD_MAP_ASPECT_RATIO = 843 / 465;

function usePrefetchImages(images: string[]) {
    // This ref won't be used by the actual component
    // but the ref is kept in React memory as long as
    // the component is mounted
    const ref = useRef<HTMLImageElement[] | null>(null);

    useEffect(() => {
        ref.current = images.map((src) => {
            const img = new Image();
            img.src = src;
            return img;
        });

        return () => {
            ref.current = null;
        };
    }, [images]);
}

function WorldMap({
    width,
    interfaceState,
    interfaceDispatch,
}: {
    width: number;
    interfaceState: InterfaceState;
    interfaceDispatch: React.Dispatch<InterfaceAction>;
}) {
    const mapModel = useSelector(mapModelSelector);
    const displayAreas = useSelector(displayAreasSelector);
    const unmappedAreaNames = useSelector(unmappedAreaNamesSelector);
    const debugMode = useSelector(debugModeSelector);
    // Preload large images since we don't render all maps at the
    // same time
    usePrefetchImages(imagesToPrefetch);

    const mapLayoutDebugEnabled = ENABLE_MAP_LAYOUT_DEBUG || debugMode;
    const activeSubmap = interfaceState.mapView;
    const [, setLayoutVersion] = useState(0);
    useEffect(() => {
        registerLayoutDebugHelpers();
        return subscribeLayoutOverrides(() =>
            setLayoutVersion((version) => version + 1),
        );
    }, []);

    const handleGroupClick = (hintRegion: string | undefined) => {
        if (hintRegion) {
            interfaceDispatch({ type: 'selectHintRegion', hintRegion });
        } else {
            interfaceDispatch({ type: 'leaveMapView' });
        }
    };
    const handleSubmapClick = (submap: string | undefined) => {
        if (submap) {
            interfaceDispatch({ type: 'selectMapView', province: submap });
        } else {
            interfaceDispatch({ type: 'leaveMapView' });
        }
    };

    const onChooseEntrance = (exitId: string) =>
        interfaceDispatch({ type: 'chooseEntrance', exitId });

    const currentRegionOrExit =
        interfaceState.type === 'choosingEntrance'
            ? interfaceState.exitId
            : interfaceState.hintRegion;
    const hasAreaContent = (area: HintRegion) =>
        area.checks.numTotal > 0 ||
        Object.values(area.extraLocations).some(
            (group) => (group?.numTotal ?? 0) > 0,
        );
    const othersArea = displayAreas.find((a) => a.name === OTHERS_HINT_REGION);
    const hasOthers = Boolean(othersArea && hasAreaContent(othersArea));
    const othersSelected =
        currentRegionOrExit === OTHERS_HINT_REGION ||
        (typeof currentRegionOrExit === 'string' &&
            unmappedAreaNames.has(currentRegionOrExit));
    const applyOverride = (debugPath: string, x: number, y: number) =>
        setLayoutOverride(debugPath, { x, y });

    return (
        <div
            {...{ [MAP_LAYOUT_ROOT_ATTR]: true }}
            style={{
                position: 'relative',
                userSelect: 'none',
                width,
                height: width / WORLD_MAP_ASPECT_RATIO,
                containerType: 'inline-size',
            }}
        >
            {!activeSubmap && (
                <>
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                    <img
                        draggable={false}
                        src={skyMap}
                        alt="World Map"
                        width="100%"
                        onContextMenu={(e) => {
                            e.preventDefault();
                        }}
                    />
                    <StartingEntranceMarker
                        onClick={(exitId) =>
                            interfaceDispatch({
                                type: 'chooseEntrance',
                                exitId,
                            })
                        }
                        selected={currentRegionOrExit === '\\Start'}
                    />
                    {mapModel.provinces.map((submap) => {
                        const entry = mapData[submap.provinceId];
                        const position = getLayoutOverride(submap.provinceId, {
                            x: entry.markerX,
                            y: entry.markerY,
                        });
                        return (
                            <SubmapMarker
                                key={submap.provinceId}
                                provinceId={submap.provinceId}
                                markerX={position.x}
                                markerY={position.y}
                                title={submap.name}
                                onSubmapChange={handleSubmapClick}
                                onChooseEntrance={onChooseEntrance}
                                markers={submap.regions}
                                currentRegionOrExit={currentRegionOrExit}
                                debugEnabled={mapLayoutDebugEnabled}
                                debugPath={submap.provinceId}
                                onDebugMove={applyOverride}
                            />
                        );
                    })}
                    {mapModel.regions.map((marker) => {
                        const position = getLayoutOverride(marker.debugPath, {
                            x: marker.markerX,
                            y: marker.markerY,
                        });
                        return (
                            <div key={marker.hintRegion}>
                                <MapMarker
                                    markerX={position.x}
                                    markerY={position.y}
                                    title={marker.hintRegion!}
                                    onGlickGroup={handleGroupClick}
                                    submarkerPlacement="right"
                                    selected={
                                        marker.hintRegion ===
                                        currentRegionOrExit
                                    }
                                    debugEnabled={mapLayoutDebugEnabled}
                                    debugPath={marker.debugPath}
                                    onDebugMove={applyOverride}
                                />
                            </div>
                        );
                    })}
                    {hasOthers &&
                        (() => {
                            const position = getLayoutOverride('others', {
                                x: mapData.others.markerX,
                                y: mapData.others.markerY,
                            });
                            return (
                                <MapMarker
                                    markerX={position.x}
                                    markerY={position.y}
                                    title={OTHERS_HINT_REGION}
                                    onGlickGroup={handleGroupClick}
                                    submarkerPlacement="right"
                                    selected={othersSelected}
                                    debugEnabled={mapLayoutDebugEnabled}
                                    debugPath="others"
                                    onDebugMove={applyOverride}
                                />
                            );
                        })()}
                </>
            )}
            {activeSubmap && (
                <>
                    {mapModel.provinces.map((submap) => {
                        if (submap.provinceId !== activeSubmap) {
                            return null;
                        }
                        const entry = mapData[submap.provinceId];
                        return (
                            <Submap
                                key={submap.provinceId}
                                provinceId={submap.provinceId}
                                title={submap.name}
                                onGroupChange={handleGroupClick}
                                onSubmapChange={handleSubmapClick}
                                onChooseEntrance={onChooseEntrance}
                                markers={submap.regions}
                                map={images[entry.map]}
                                exitParams={entry.exitParams}
                                activeSubmap={activeSubmap}
                                currentRegionOrExit={currentRegionOrExit}
                            />
                        );
                    })}
                </>
            )}
        </div>
    );
}

export default WorldMap;
