import { Menu } from 'react-contexify';
import { useMapLayoutDebugMenuElements } from './MapLayoutDebugMenuItems';

export default function MapLayoutDebugContextMenu() {
    const mapLayoutDebugMenuElements = useMapLayoutDebugMenuElements();

    return <Menu id="map-layout-debug">{mapLayoutDebugMenuElements}</Menu>;
}
