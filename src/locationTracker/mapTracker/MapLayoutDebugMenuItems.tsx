import { useEffect, useMemo, useState } from 'react';
import {
    Item,
    type ItemParams,
    type PredicateParams,
    Separator,
} from 'react-contexify';
import { useSelector } from 'react-redux';
import { debugModeSelector } from '../../customization/Selectors';
import {
    ENABLE_MAP_LAYOUT_DEBUG,
    getActiveLayoutMovePath,
    subscribeActiveLayoutMove,
    toggleActiveLayoutMovePath,
} from './layoutDebug';

export interface MapLayoutDebugContextMenuProps {
    layoutDebugPath?: string;
}

type LayoutDebugParams = PredicateParams<MapLayoutDebugContextMenuProps>;
type LayoutDebugItemParams = ItemParams<MapLayoutDebugContextMenuProps>;

const layoutDebugPath = ({ props }: LayoutDebugParams) =>
    props?.layoutDebugPath;

function useActiveLayoutMovePath() {
    const [activePath, setActivePath] = useState(getActiveLayoutMovePath);

    useEffect(
        () =>
            subscribeActiveLayoutMove(() =>
                setActivePath(getActiveLayoutMovePath()),
            ),
        [],
    );

    return activePath;
}

export function useMapLayoutDebugEnabled() {
    const debugMode = useSelector(debugModeSelector);
    return ENABLE_MAP_LAYOUT_DEBUG || debugMode;
}

export function useMapLayoutDebugMenuElements() {
    const mapLayoutDebugEnabled = useMapLayoutDebugEnabled();
    const activeLayoutMovePath = useActiveLayoutMovePath();

    return useMemo(() => {
        if (!mapLayoutDebugEnabled) {
            return [];
        }

        return [
            <Item
                key="map-layout-debug-move"
                disabled={(params: LayoutDebugParams) =>
                    !layoutDebugPath(params)
                }
                hidden={(params: LayoutDebugParams) =>
                    activeLayoutMovePath === layoutDebugPath(params)
                }
                onClick={(params: LayoutDebugItemParams) => {
                    const path = layoutDebugPath(params);
                    if (path) {
                        toggleActiveLayoutMovePath(path);
                    }
                }}
            >
                Move map marker on map
            </Item>,
            <Item
                key="map-layout-debug-stop"
                disabled={(params: LayoutDebugParams) =>
                    !layoutDebugPath(params)
                }
                hidden={(params: LayoutDebugParams) =>
                    activeLayoutMovePath !== layoutDebugPath(params)
                }
                onClick={(params: LayoutDebugItemParams) => {
                    const path = layoutDebugPath(params);
                    if (path) {
                        toggleActiveLayoutMovePath(path);
                    }
                }}
            >
                Stop moving map marker
            </Item>,
            <Separator
                key="map-layout-debug-separator"
                hidden={(params: LayoutDebugParams) => !layoutDebugPath(params)}
            />,
        ];
    }, [activeLayoutMovePath, mapLayoutDebugEnabled]);
}
