import Location from './Location';
import LocationGrid from './LocationGrid';

export default function LocationGroup({
    compact,
    wide,
    locations,
    onChooseEntrance,
    onGoToEntrance,
    forceFullName = false,
}: {
    compact: boolean;
    wide: boolean;
    /* the list of locations this group contains */
    locations: string[];
    onChooseEntrance: (exitId: string) => void;
    onGoToEntrance: (exitId: string) => void;
    forceFullName?: boolean;
}) {
    return (
        <LocationGrid compact={compact} wide={wide}>
            {locations.map((l) => (
                <Location
                    key={l}
                    compact={compact}
                    forceFullName={forceFullName}
                    onChooseEntrance={onChooseEntrance}
                    onGoToEntrance={onGoToEntrance}
                    id={l}
                />
            ))}
        </LocationGrid>
    );
}
