import regions from '../data/stageToRegion.json';

export const gameAreas: Record<string, string> = {
    ...regions,
    F000: 'Skyloft',
    F001r: 'Knight Academy',
    F002r: "Beedle's Airshop",
    F004r: 'Bazaar',
    F005r: "Orielle and Parrow's House",
    F006r: "Kukiel's House",
    F007r: "Piper's House",
    F008r: 'Inside the Statue of the Goddess',
    F009r: 'Sparring Hall',
    F010r: 'Isle of Songs',
    F011r: 'Lumpy Pumpkin',
    F012r: "Batreaux's House",
    F013r: "Sparrot's House",
    F014r: 'Potion Shop',
    F015r: 'Scrap Shop',
    F016r: "Pipit's House",
    F017r: "Rupin's House",
    F018r: "Peatrice's House",
    F019r: 'Bamboo Island',
    F020: 'The Sky',
    F021: 'Cutscene Sky',
    F023: 'Thunderhead',
    F100: 'Faron Woods',
    F100_1: 'Great Tree',
    F101: 'Deep Woods',
    F102: 'Lake Floria',
    F102_1: 'Outside Ancient Cistern',
    F102_2: "Faron's Lair",
    F103: 'Flooded Faron Woods',
    F103_1: 'Flooded Great Tree',
    F200: 'Eldin Volcano',
    F201: 'Volcano Summit',
    F201_1: 'Inside the Volcano',
    F201_2: 'Inside the Volcano (Bokoblin Base)',
    F201_3: 'Outside Fire Sanctuary',
    F201_4: 'Volcano Waterfall',
    F202: 'Bokoblin Base',
    F210: 'Mogma Turf',
    F211: 'Thrill Digger',
    F221: 'Fire Dragon Room',
    F300: 'Lanayru Desert',
    F300_1: 'Lanayru Mine',
    F300_2: 'Lightning Node',
    F300_3: 'Fire Node',
    F300_4: 'Temple of Time',
    F300_5: 'Lanayru Mining Facility to Temple of Time',
    F301: 'Ancient Harbour',
    F301_1: 'Lanayru Sand Sea',
    F301_2: 'Inside Pirate Stronghold',
    F301_3: "Skipper's Retreat",
    F301_4: 'Shipyard',
    F301_5: "Skipper's Retreat Shack",
    F301_6: 'Outside Pirate Stronghold',
    F301_7: 'Construction Bay',
    F302: 'Lanayru Gorge',
    F303: 'Lanayru Caves',
    D000: 'Waterfall Cave',
    D100: 'Skyview Temple',
    D101: 'Ancient Cistern',
    D200: 'Earth Temple',
    D201: 'Fire Sanctuary',
    D201_1: 'Fire Sanctuary (Inner)',
    D300: 'Lanayru Mining Facility',
    D300_1: 'Lanayru Mining Facility (Back)',
    D301: 'Sandship',
    D301_1: 'Sandship (Escape)',
};

export function gameAreaRegion(stage: string) {
    if (/^[FDSB]1/.test(stage)) return 'Faron';
    if (/^[FDSB]2/.test(stage)) return 'Eldin';
    if (/^[FDSB]3/.test(stage)) return 'Lanayru';
    if (/^[FB]4/.test(stage)) return 'Sealed Grounds';
    return 'Sky / Skyloft';
}

export function areaLabel(stage: string) {
    return `${gameAreas[stage] ?? 'Other game area'} (${stage})`;
}
