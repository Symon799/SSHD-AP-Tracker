import { useReducer } from 'react';
import { useSelector } from 'react-redux';
import {
    getOwningProvince,
    type MapModel,
} from '../locationTracker/mapTracker/MapModel';
import { mapModelSelector } from '../locationTracker/mapTracker/Selectors';
import type { ExitMapping, HintRegion } from '../logic/Locations';
import type { AreaGraph, Logic } from '../logic/Logic';
import { areaGraphSelector } from '../logic/Selectors';
import {
    displayAreasSelector,
    exitsByIdSelector,
    OTHERS_HINT_REGION,
} from './Selectors';

export type InterfaceState =
    | {
          /**
           * The tracker is prompting the user to pick the entrance corresponding to
           * a given exit.
           */
          type: 'choosingEntrance';
          mapView: string | undefined;
          exitId: string;
          previousHintRegion: string | undefined;
      }
    | {
          /**
           * The normal tracker view, possibly presenting the user with a list of checks.
           */
          type: 'viewingChecks';
          hintRegion: string | undefined;
          mapView: string | undefined;
      };

type InterfaceView =
    | InterfaceState
    | {
          /**
           * The tracker is in its initial state. If starting entrance is randomized,
           * this will resolve to picking the starting entrance, otherwise it will
           * resolve to the starting region.
           */
          type: 'initial';
      };

type InterfaceStateInternal = {
    view: InterfaceView;
    lastRegionsByMap: Record<string, string | undefined>;
};

export type InterfaceAction =
    | {
          /** Clicking on Faron, Eldin, Lanayru, or Skyloft */
          type: 'selectMapView';
          province: string;
      }
    | {
          /** Selecting a particular hint region */
          type: 'selectHintRegion';
          hintRegion: string;
      }
    | {
          /** Back to Sky */
          type: 'leaveMapView';
      }
    | {
          /** Choose an entrance */
          type: 'chooseEntrance';
          exitId: string;
      }
    | {
          /** Selected an entrance, or canceled the dialog */
          type: 'cancelChooseEntrance';
          selectedEntrance: string | undefined;
      };

function getHintRegionForEntrance(
    entranceId: string,
    areaGraph: Logic['areaGraph'],
): string {
    return areaGraph.entranceHintRegions[entranceId];
}

function getInitialState(
    mapModel: MapModel,
    areaGraph: AreaGraph,
    exits: Record<string, ExitMapping>,
): InterfaceState {
    const startingExit = exits['\\Start'];

    // If the user needs to select a starting entrance, prompt first
    if (startingExit.canAssign && !startingExit.entrance) {
        return {
            type: 'choosingEntrance',
            mapView: undefined,
            exitId: startingExit.exit.id,
            previousHintRegion: undefined,
        };
    }

    // Otherwise select the starting area
    if (startingExit.entrance) {
        const hintRegion = getHintRegionForEntrance(
            startingExit.entrance.id,
            areaGraph,
        );
        const result = getOwningProvince(mapModel, hintRegion);
        const mapView = result.type === 'ok' ? result.result : undefined;
        return {
            type: 'viewingChecks',
            mapView,
            hintRegion,
        };
    }
    return {
        type: 'viewingChecks',
        mapView: undefined,
        hintRegion: undefined,
    };
}

function interfaceReducer(
    mapModel: MapModel,
    areaGraph: AreaGraph,
    exits: Record<string, ExitMapping>,
    displayedAreas: HintRegion[],
) {
    return (
        state_: InterfaceStateInternal,
        action: InterfaceAction,
    ): InterfaceStateInternal => {
        // Make sure initial state is resolved
        const state =
            state_.view.type === 'initial'
                ? getInitialState(mapModel, areaGraph, exits)
                : state_.view;
        const lastRegionsByMap = { ...state_.lastRegionsByMap };
        const mapKey = (map: string | undefined) => map ?? 'world';
        const areaByName = new Map(
            displayedAreas.map((area) => [area.name, area]),
        );
        const hasContent = (area: HintRegion) =>
            area.checks.numTotal > 0 ||
            Object.values(area.extraLocations).some(
                (group) => (group?.numTotal ?? 0) > 0,
            );
        const regionsOnMap = (map: string | undefined) => {
            const markers =
                map === undefined
                    ? mapModel.regions
                    : (mapModel.provinces.find(
                          (province) => province.provinceId === map,
                      )?.regions ?? []);
            const regions = markers.flatMap((marker) =>
                marker.hintRegion && areaByName.has(marker.hintRegion)
                    ? [marker.hintRegion]
                    : [],
            );
            const others = areaByName.get(OTHERS_HINT_REGION);
            if (map === undefined && others && hasContent(others))
                regions.push(OTHERS_HINT_REGION);
            return regions;
        };
        const currentRegion =
            state.type === 'viewingChecks'
                ? state.hintRegion
                : state.previousHintRegion;
        if (
            currentRegion &&
            regionsOnMap(state.mapView).includes(currentRegion)
        ) {
            lastRegionsByMap[mapKey(state.mapView)] = currentRegion;
        }
        const onMap = (mapView: string | undefined) => {
            const regions = regionsOnMap(mapView);
            const remembered = lastRegionsByMap[mapKey(mapView)];
            const hintRegion =
                remembered && regions.includes(remembered)
                    ? remembered
                    : (regions.find((region) =>
                          hasContent(areaByName.get(region)!),
                      ) ?? regions[0]);
            return { mapView, hintRegion };
        };
        const withView = (view: InterfaceState): InterfaceStateInternal => ({
            view,
            lastRegionsByMap,
        });
        switch (action.type) {
            case 'selectMapView': {
                const selection = onMap(action.province);
                if (state.type === 'choosingEntrance') {
                    return withView({
                        ...state,
                        mapView: selection.mapView,
                        previousHintRegion: selection.hintRegion,
                    });
                }
                return withView({
                    type: 'viewingChecks',
                    ...selection,
                });
            }

            case 'selectHintRegion': {
                const owningProvince = getOwningProvince(
                    mapModel,
                    action.hintRegion,
                );
                return withView({
                    type: 'viewingChecks',
                    mapView:
                        owningProvince.type === 'ok'
                            ? owningProvince.result
                            : state.mapView,
                    hintRegion: action.hintRegion,
                });
            }
            case 'leaveMapView': {
                const selection = onMap(undefined);
                return withView(
                    state.type === 'choosingEntrance'
                        ? {
                              ...state,
                              mapView: undefined,
                              previousHintRegion: selection.hintRegion,
                          }
                        : { type: 'viewingChecks', ...selection },
                );
            }
            case 'chooseEntrance':
                return withView({
                    type: 'choosingEntrance',
                    exitId: action.exitId,
                    mapView: state.mapView,
                    previousHintRegion:
                        state.type === 'viewingChecks'
                            ? state.hintRegion
                            : state.previousHintRegion,
                });
            case 'cancelChooseEntrance': {
                const hintRegion =
                    state.type === 'choosingEntrance'
                        ? state.previousHintRegion
                        : undefined;
                return withView({
                    type: 'viewingChecks',
                    hintRegion,
                    mapView: state.mapView,
                });
            }
        }
    };
}

const initialMapState: InterfaceStateInternal = {
    view: { type: 'initial' },
    lastRegionsByMap: {},
};

export function useTrackerInterfaceReducer(): [
    InterfaceState,
    React.Dispatch<InterfaceAction>,
] {
    const mapModel = useSelector(mapModelSelector);
    const areaGraph = useSelector(areaGraphSelector);
    const exits = useSelector(exitsByIdSelector);
    const displayedAreas = useSelector(displayAreasSelector);
    const [internalTrackerState, dispatch] = useReducer(
        interfaceReducer(mapModel, areaGraph, exits, displayedAreas),
        undefined,
        () => initialMapState,
    );

    if (internalTrackerState.view.type === 'initial') {
        // Resolve initial state
        return [getInitialState(mapModel, areaGraph, exits), dispatch];
    }

    return [internalTrackerState.view, dispatch];
}
