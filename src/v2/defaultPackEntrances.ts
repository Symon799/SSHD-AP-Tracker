import type { AreaGraph } from '../logic/Logic';
import type { MapLink, MapPack } from './pack';

type Direction = readonly [source: string, target: string, exit: string];

// Reviewed physical links only. Do not infer a door from two matching map names.
const pairs = [
    [
        'Skyloft',
        'Sky Keep',
        'Central Skyloft -> Sky Keep',
        'Sky Keep -> Central Skyloft',
    ],
    [
        'Skyloft',
        "The Goddess's Silent Realm",
        "Central Skyloft -> The Goddess's Silent Realm",
        "The Goddess's Silent Realm -> Central Skyloft",
    ],
    [
        'Eldin Volcano',
        "Din's Silent Realm",
        "Eldin Volcano -> Din's Silent Realm",
        "Din's Silent Realm -> Eldin Volcano",
    ],
    [
        'Deep Woods',
        'Skyview Temple',
        'Deep Woods -> Skyview Temple',
        'Skyview Temple -> Deep Woods',
    ],
    [
        'Eldin Volcano',
        'Earth Temple',
        'Eldin Volcano -> Earth Temple',
        'Earth Temple -> Eldin Volcano',
    ],
    [
        'Lanayru Desert',
        'Lanayru Mining Facility',
        'Lanayru Desert -> Lanayru Mining Facility',
        'Lanayru Mining Facility -> Lanayru Desert',
    ],
    [
        'Floria Waterfall',
        'Ancient Cistern 1F',
        'Floria Waterfall -> Ancient Cistern',
        'Ancient Cistern -> Floria Waterfall',
    ],
    [
        'Volcano Summit in front of Temple',
        'Fire Sanctuary F1',
        'Inside the Volcano -> Fire Sanctuary',
        'Fire Sanctuary -> Inside the Volcano',
    ],
    [
        'Faron Woods',
        "Farore's Silent Realm",
        "Faron Woods -> Farore's Silent Realm",
        "Farore's Silent Realm -> Faron Woods",
    ],
    [
        'Sealed Temple',
        "Hylia's Realm",
        'Sealed Temple -> Gate of Time',
        'Gate of Time -> Sealed Temple',
    ],
    [
        'Sealed Grounds',
        'Sealed Temple',
        'Sealed Grounds Spiral -> Sealed Temple',
        'Sealed Temple -> Sealed Grounds Spiral',
    ],
    [
        'Behind the Temple',
        'Sealed Temple',
        'Behind the Temple -> Sealed Temple',
        'Sealed Temple -> Behind the Temple',
    ],
    [
        "Skipper's Retreat",
        "Skipper's Retreat Shack",
        "Skipper's Retreat -> Skipper's Shack",
        "Skipper's Shack -> Skipper's Retreat",
    ],
    [
        'Eldin Volcano',
        'Thrill Digger Cave',
        'Eldin Volcano -> Thrill Digger',
        'Thrill Digger -> Eldin Volcano',
    ],
    [
        'Lanayru Desert',
        'Lightning Node',
        'Lanayru Desert -> Lightning Node',
        'Lightning Node -> Lanayru Desert',
    ],
    [
        'Lanayru Desert',
        'Fire Node',
        'Lanayru Desert -> Fire Node',
        'Fire Node -> Lanayru Desert',
    ],
    [
        'Lanayru Mine',
        'Lanayru Caves',
        'Lanayru Mine -> Lanayru Caves',
        'Lanayru Caves -> Lanayru Mine',
    ],
    [
        'Lanayru Desert',
        'Lanayru Caves',
        'Lanayru Desert -> Lanayru Caves',
        'Lanayru Caves -> Lanayru Desert',
    ],
    [
        'Ancient Harbour',
        'Lanayru Caves',
        'Ancient Harbour -> Lanayru Caves',
        'Lanayru Caves -> Ancient Harbour',
    ],
    [
        'Lanayru Gorge',
        'Lanayru Caves',
        'Lanayru Gorge -> Lanayru Caves',
        'Lanayru Caves -> Lanayru Gorge',
    ],
    [
        'Sealed Grounds',
        'Behind the Temple',
        'Sealed Grounds -> Behind the Temple',
        'Behind the Temple -> Sealed Grounds',
    ],
    [
        'Behind the Temple',
        'Faron Woods',
        'Behind the Temple -> Faron Woods',
        'Faron Woods -> Behind the Temple',
    ],
    [
        'Faron Woods',
        'Deep Woods',
        'Faron Woods -> Deep Woods',
        'Deep Woods -> Faron Woods',
    ],
    [
        'Lake Floria',
        'Dragon Lair',
        "Lake Floria -> Farore's Lair",
        "Farore's Lair -> Lake Floria",
    ],
    [
        'Dragon Lair',
        'Floria Waterfall',
        "Farore's Lair -> Floria Waterfall",
        "Floria Waterfall -> Farore's Lair",
    ],
    [
        'Floria Waterfall',
        'Faron Woods',
        'Floria Waterfall -> Faron Woods',
        'Faron Woods -> Floria Waterfall',
    ],
    [
        'Eldin Volcano',
        'Volcano Summit',
        'Eldin Volcano -> Volcano Summit',
        'Volcano Summit -> Eldin Volcano',
    ],
    [
        'Volcano Summit',
        'Volcano Summit Waterfall',
        'Volcano Summit -> Volcano Summit Waterfall',
        'Volcano Summit Waterfall -> Volcano Summit',
    ],
    [
        'Lanayru Mine',
        'Lanayru Desert',
        'Lanayru Mine -> Lanayru Desert',
        'Lanayru Desert -> Lanayru Mine',
    ],
    [
        'Ancient Harbour',
        'Lanayru Sand Sea',
        'Ancient Harbour -> Lanayru Sand Sea',
        'Lanayru Sand Sea -> Ancient Harbour',
    ],
    [
        "Skipper's Retreat",
        'Lanayru Sand Sea',
        "Skipper's Retreat -> Lanayru Sand Sea",
        "Lanayru Sand Sea -> Skipper's Retreat",
    ],
    [
        'Shipyard',
        'Lanayru Sand Sea',
        'Shipyard -> Lanayru Sand Sea',
        'Lanayru Sand Sea -> Shipyard',
    ],
    [
        'Pirate Stronghold Exterior',
        'Lanayru Sand Sea',
        'Pirate Stronghold -> Lanayru Sand Sea',
        'Lanayru Sand Sea -> Pirate Stronghold',
    ],
] as const;

const directions: Direction[] = [
    ...pairs.flatMap<Direction>(([source, target, forward, reverse]) => [
        [source, target, forward],
        [target, source, reverse],
    ]),
    ['Lanayru Sand Sea', 'Sandship 1F', 'Lanayru Sand Sea -> Sandship'],
    [
        'Lanayru Desert',
        "Nayru's Silent Realm",
        "Lanayru Desert -> Nayru's Silent Realm",
    ],
    ['Faron Woods', 'Lake Floria', 'Faron Woods -> Lake Floria'],
    [
        'Volcano Summit in front of Temple',
        'Volcano Summit',
        'Inside the Volcano -> Volcano Summit',
    ],
    [
        'Hall of Robots',
        'Temple of Time',
        'LMF End of Hall of Ancient Robots -> Temple of Time West Post LMF Area',
    ],
];

// A reviewed landing area may be useful even if its corresponding source marker
// is missing or ambiguous. Unlisted areas intentionally have no automatic owner.
const arrivals: Record<string, readonly string[]> = {
    'Sky Keep': ['Sky Keep'],
    "The Goddess's Silent Realm": ["The Goddess's Silent Realm"],
    "Din's Silent Realm": ["Din's Silent Realm"],
    'The Sky': ['Sky', 'The Thunderhead'],
    Skyloft: [
        'Central Skyloft',
        'Upper Skyloft',
        'Skyloft Village',
        'Skyloft Past Waterfall Cave',
    ],
    'Knight Academy F1': [
        'Knight Academy',
        'Knight Academy Lower East Door',
        'Knight Academy Lower West Door',
    ],
    'Knight Academy F2': [
        'Knight Academy Chimney',
        'Knight Academy Upper North Door',
        'Knight Academy Upper South Door',
    ],
    'Sparring Hall': ['Sparring Hall North Door', 'Sparring Hall South Door'],
    Bazaar: ['Bazaar North', 'Bazaar West', 'Bazaar South'],
    'Waterfall Cave': ['Waterfall Cave'],
    'Lumpy Pumpkin': [
        'Lumpy Pumpkin Main East Door',
        'Lumpy Pumpkin Main West Door',
        'Lumpy Pumpkin Back Door',
    ],
    'Sealed Grounds': [
        'Sealed Grounds',
        'Sealed Grounds Spiral',
        'Sealed Grounds Statue',
    ],
    'Sealed Temple': ['Sealed Temple'],
    'Behind the Temple': ['Behind the Temple', 'Behind the Temple Statue'],
    "Hylia's Realm": ['Gate of Time'],
    'Faron Woods': [
        'Faron Woods',
        'Faron Woods Top of Great Tree',
        'Faron Woods Entry Statue',
        'Viewing Platform Statue',
        'In the Woods Statue',
        'The Great Tree Statue',
    ],
    'Inside the Great Tree': [
        'Great Tree Underwater',
        'Great Tree Swinging Platforms',
        'Great Tree Inner Bridge',
    ],
    'Deep Woods': ['Deep Woods', 'Deep Woods Statue', 'Forest Temple Statue'],
    'Lake Floria': ['Lake Floria', 'Lake Floria Statue'],
    'Dragon Lair': ["Farore's Lair"],
    'Floria Waterfall': ['Floria Waterfall', 'Floria Waterfall Statue'],
    "Farore's Silent Realm": ["Farore's Silent Realm"],
    'Skyview Temple': ['Skyview Temple'],
    'Ancient Cistern 1F': ['Ancient Cistern'],
    'Eldin Volcano': [
        'Eldin Volcano',
        'Volcano Entrance Statue',
        'Volcano East Statue',
        'Volcano Ascent Statue',
        'Temple Entrance Statue',
    ],
    'Mogma Turf': ['Mogma Turf Dive', 'Mogma Turf Second Vent'],
    'Thrill Digger Cave': ['Thrill Digger'],
    'Volcano Summit': ['Volcano Summit'],
    'Volcano Summit Waterfall': ['Volcano Summit Waterfall'],
    'Volcano Summit in front of Temple': [
        'Inside the Volcano',
        'Inside the Volcano Statue',
    ],
    'Earth Temple': ['Earth Temple'],
    'Fire Sanctuary F1': ['Fire Sanctuary', 'Inside the Fire Sanctuary Statue'],
    'Lanayru Desert': [
        'Lanayru Desert',
        'Desert Entrance Statue',
        'West Desert Statue',
        'North Desert Statue',
        'Stone Cache Statue',
    ],
    'Lanayru Mine': ['Lanayru Mine', 'Lanayru Mine Entry Statue'],
    'Fire Node': ['Fire Node'],
    'Lightning Node': ['Lightning Node'],
    'Lanayru Caves': ['Lanayru Caves'],
    'Lanayru Gorge': ['Lanayru Gorge', 'Lanayru Gorge Statue'],
    'Temple of Time': [
        'Temple of Time North',
        'Temple of Time South',
        'Temple of Time West Post LMF Area',
        'Temple of Time Statue',
        'Desert Gorge Statue',
    ],
    'Ancient Harbour': ['Ancient Harbour', 'Ancient Harbour Statue'],
    'Lanayru Sand Sea': ['Lanayru Sand Sea'],
    'Pirate Stronghold Exterior': [
        'Pirate Stronghold',
        'Pirate Stronghold Dock',
        'Pirate Stronghold Inside the Shark Head',
        'Pirate Stronghold Statue',
    ],
    'Pirate Stronghold Interior': [
        'Pirate Stronghold Side Door',
        'Pirate Stronghold Top Door',
    ],
    "Skipper's Retreat": ["Skipper's Retreat", "Skipper's Retreat Statue"],
    "Skipper's Retreat Shack": ["Skipper's Shack"],
    Shipyard: ['Shipyard', 'Shipyard Statue'],
    'Construction Bay': [
        'Construction Bay Upper Door',
        'Construction Bay Lower Door',
    ],
    "Nayru's Silent Realm": ["Nayru's Silent Realm"],
    'Lanayru Mining Facility': ['Lanayru Mining Facility'],
    'Sandship 1F': ['Sandship'],
};

type Definitions = Pick<
    AreaGraph,
    | 'exits'
    | 'entrances'
    | 'vanillaConnections'
    | 'entranceConnections'
    | 'conditionalVanillaConnections'
>;

export function applyDefaultPackEntrances(
    pack: MapPack,
    graph: Definitions,
): MapPack {
    const mapNamed = (name: string) => {
        const candidates = pack.maps.filter((map) => map.name === name);
        return candidates.length === 1 ? candidates[0] : undefined;
    };
    const arrivalOwners = new Map<string, string>();
    const arrivalsByMap = new Map<string, string[]>();
    for (const map of pack.maps)
        for (const id of map.entranceIds) arrivalOwners.set(id, map.id);
    const ownersByLabel = new Map(
        Object.entries(arrivals).flatMap(([map, labels]) =>
            labels.map((label) => [label, map] as const),
        ),
    );
    for (const [id, entrance] of Object.entries(graph.entrances)) {
        if (arrivalOwners.has(id)) continue;
        const label = entrance.short_name.split(' -> ').at(-1) ?? '';
        const owner = ownersByLabel.get(label);
        const map = owner && mapNamed(owner);
        if (!map) continue;
        arrivalOwners.set(id, map.id);
        const ids = arrivalsByMap.get(map.id) ?? [];
        ids.push(id);
        arrivalsByMap.set(map.id, ids);
    }
    const reviewed = new Map<string, Map<string, string>>();
    const bound = new Set(
        pack.maps.flatMap((map) =>
            map.markers.flatMap((marker) =>
                marker.kind === 'link' && marker.exitId ? [marker.exitId] : [],
            ),
        ),
    );
    for (const [from, to, description] of directions) {
        const source = mapNamed(from);
        const target = mapNamed(to);
        if (!source || !target) continue;
        const exits = Object.keys(graph.exits).filter(
            (id) =>
                graph.exits[id].short_name === description &&
                (graph.entranceConnections[id] ||
                    graph.conditionalVanillaConnections[id]),
        );
        if (exits.length !== 1) continue;
        const [exitId] = exits;
        if (
            bound.has(exitId) ||
            arrivalOwners.get(graph.vanillaConnections[exitId]) !== target.id
        )
            continue;
        const bindings = reviewed.get(source.id) ?? new Map<string, string>();
        const candidates = source.markers.filter(
            (marker): marker is MapLink =>
                marker.kind === 'link' &&
                marker.targetMapId === target.id &&
                marker.navigation !== 'back' &&
                !marker.label.startsWith('Back to '),
        );
        if (
            candidates.length !== 1 ||
            candidates[0].exitId ||
            bindings.has(candidates[0].id)
        )
            continue;
        bindings.set(candidates[0].id, exitId);
        reviewed.set(source.id, bindings);
        bound.add(exitId);
    }
    return {
        ...pack,
        maps: pack.maps.map((map) => {
            const links = reviewed.get(map.id);
            const newArrivals = arrivalsByMap.get(map.id);
            if (!links && !newArrivals) return map;
            return {
                ...map,
                entranceIds: newArrivals
                    ? [...map.entranceIds, ...newArrivals]
                    : map.entranceIds,
                markers: links
                    ? map.markers.map((marker) => {
                          const exitId = links.get(marker.id);
                          return marker.kind === 'link' && exitId
                              ? { ...marker, exitId }
                              : marker;
                      })
                    : map.markers,
            };
        }),
    };
}
