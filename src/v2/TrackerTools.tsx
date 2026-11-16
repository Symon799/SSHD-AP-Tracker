import { useState } from 'react';
import { useSelector } from 'react-redux';
import CustomizationModal from '../customization/CustomizationModal';
import { debugModeSelector } from '../customization/Selectors';
import { TrackerToolsView } from '../Tracker';
import type { MapPack } from './pack';
import TrackingDiagnostics from './TrackingDiagnostics';

export default function TrackerTools({
    footer,
    pack,
}: {
    footer: React.ReactNode;
    pack: MapPack;
}) {
    const [customizing, setCustomizing] = useState(false);
    const debug = useSelector(debugModeSelector);
    return (
        <>
            <TrackerToolsView
                openCustomization={() => setCustomizing(true)}
                footerContent={footer}
                showMapLayoutExport={false}
                scrollableSections
                extraContent={
                    debug ? <TrackingDiagnostics pack={pack} /> : undefined
                }
            />
            <CustomizationModal
                open={customizing}
                onOpenChange={setCustomizing}
                mapPack
            />
        </>
    );
}
