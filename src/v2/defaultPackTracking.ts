import { locationRuleKey, type LocationRule } from './locationTracking';
import type { MapPack } from './pack';

const stages = (...codes: string[]): LocationRule[] =>
    codes.map((stage) => ({ stage }));
const rooms = (stage: string, ...ids: number[]): LocationRule[] =>
    ids.map((room) => ({ stage, room }));

// Stage codes and room/layer exceptions follow the APWorld stage table,
// entrance spawns and location paths, not the names of the editor links.
export const defaultTrackingRules: Readonly<Record<string, LocationRule[]>> = {
    "The Goddess's Silent Realm": stages('S000'),
    'Sky Keep': stages(
        'D003_0',
        'D003_1',
        'D003_2',
        'D003_3',
        'D003_4',
        'D003_5',
        'D003_6',
        'D003_7',
        'D003_8',
    ),
    'Knight Academy F1': rooms('F001r', 1, 2),
    'Knight Academy F2': rooms('F001r', 3, 4, 5, 6),
    'Sparring Hall': stages('F009r'),
    Bazaar: stages('F004r'),
    'Waterfall Cave': stages('D000'),
    'Lumpy Pumpkin': stages('F011r'),

    'Sealed Grounds': stages('F401'),
    'Sealed Temple': stages('F402'),
    'Behind the Temple': stages('F400'),
    "Hylia's Realm": stages('F404', 'B400'),
    'Faron Woods': stages('F100'),
    'Inside the Great Tree': stages('F100_1'),
    'Deep Woods': stages('F101'),
    'Lake Floria': stages('F102'),
    'Floria Waterfall': stages('F102_1'),
    'Dragon Lair': stages('F102_2'),
    'Flooded Faron Woods': stages('F103'),
    'Flooded Great Tree': stages('F103_1'),
    "Farore's Silent Realm": stages('S100'),
    'Skyview Temple': stages('D100'),
    'SVT Boss Key': stages('B100'),
    'Skyview Spring': stages('B100_1'),
    'Ancient Cistern 1F': stages('D101'),
    'AC Boss Room': stages('B101'),
    'AC Sacred Flame': stages('B101_1'),

    'Eldin Volcano': stages('F200'),
    "Din's Silent Realm": stages('S200'),
    'Mogma Turf': stages('F210'),
    'Thrill Digger Cave': stages('F211'),
    'Volcano Summit': stages('F201', 'F201_1'),
    'Volcano Summit Waterfall': stages('F201_4'),
    'Volcano Summit in front of Temple': stages('F201_3'),
    'Bokoblin Base': stages('F202'),
    'Bokoblin Base Summit': [
        ...stages('F201_2'),
        { stage: 'F201_1', room: 0, layer: 4 },
    ],
    'Bokoblin Base Lower Eldin Cave': stages('F202_1'),
    'Bokoblin Base Upper Eldin Cave': stages('F202_2'),
    'Lower Eldin Cave': stages('F202_3'),
    'Upper Eldin Cave': stages('F202_4'),
    'Fire Dragons Lair': stages('F221'),
    'Earth Temple': stages('D200', 'B200', 'B210'),
    'Fire Sanctuary F1': stages('D201', 'D201_1', 'B201', 'B201_1'),
    'Fire Sanctuary B1': rooms('D201', 9),

    'Lanayru Desert': stages('F300'),
    'Lanayru Mine': stages('F300_1'),
    'Lightning Node': stages('F300_2'),
    'Fire Node': stages('F300_3'),
    'Temple of Time': stages('F300_4'),
    'Hall of Robots': stages('F300_5'),
    'Ancient Harbour': stages('F301'),
    'Lanayru Sand Sea': stages('F301_1'),
    'Pirate Stronghold Interior': stages('F301_2'),
    "Skipper's Retreat": stages('F301_3'),
    Shipyard: stages('F301_4'),
    "Skipper's Retreat Shack": stages('F301_5'),
    'Pirate Stronghold Exterior': stages('F301_6'),
    'Construction Bay': stages('F301_7'),
    'Lanayru Gorge': stages('F302'),
    'Lanayru Caves': stages('F303'),
    "Nayru's Silent Realm": stages('S300'),
    'Lanayru Mining Facility': stages('D300', 'D300_1'),
    'LMF Boss Room': stages('B300'),
    'Sandship 1F': stages('D301', 'B301'),
    'Sandship B1': rooms('D301', 2, 3, 5, 7),
    'Sandship B2': rooms('D301', 9, 10),
};

export function applyDefaultTrackingRules(pack: MapPack): MapPack {
    const counts = new Map<string, number>();
    for (const map of pack.maps)
        counts.set(map.name, (counts.get(map.name) ?? 0) + 1);
    const rulesById = new Map(
        pack.maps.flatMap((map) => {
            const rules = defaultTrackingRules[map.name];
            return counts.get(map.name) === 1 && Array.isArray(rules)
                ? [[map.id, rules] as const]
                : [];
        }),
    );
    const replacements = new Set(
        [...rulesById.values()].flatMap((rules) => rules.map(locationRuleKey)),
    );
    return {
        ...pack,
        maps: pack.maps.map((map) => {
            const current = map.trackingRules ?? [];
            const retained = current.filter(
                (rule) => !replacements.has(locationRuleKey(rule)),
            );
            const additions = rulesById.get(map.id);
            return additions || retained.length !== current.length
                ? { ...map, trackingRules: [...retained, ...(additions ?? [])] }
                : map;
        }),
    };
}
