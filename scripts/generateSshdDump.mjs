import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

const [
    sshdRandoRoot = '.tmp_sshd_rando',
    sshdApworldLocationsPath = '.tmp_sshd_apworld/Locations.py',
    outputPath = 'testData/sshd-dump.yaml',
    optionsOutputPath = 'testData/sshd-options.yaml',
] = process.argv.slice(2);

const timeOfDay = {
    'Day Only': 1,
    'Night Only': 2,
    All: 3,
};

const progressiveItemMaxes = new Map([
    ['Ancient Cistern Small Key', 2],
    ['Empty Bottle', 5],
    ['Extra Wallet', 3],
    ['Fire Sanctuary Small Key', 3],
    ['Gratitude Crystal', 80],
    ['Gratitude Crystal Pack', 13],
    ['Group of Tadtones', 17],
    ['Key Piece', 5],
    ['Lanayru Caves Small Key', 2],
    ['Lanayru Mining Facility Small Key', 1],
    ['Progressive Sword', 6],
    ['Progressive Beetle', 4],
    ['Progressive Bow', 3],
    ['Progressive Bug Net', 2],
    ['Progressive Mitts', 2],
    ['Progressive Pouch', 1],
    ['Progressive Slingshot', 2],
    ['Progressive Wallet', 4],
    ['Sandship Small Key', 2],
    ['Sky Keep Small Key', 1],
    ['Skyview Small Key', 2],
]);

const itemNameAliases = new Map([
    ['Rattle', 'Baby Rattle'],
    ['Skyview Temple Boss Key', 'Skyview Boss Key'],
    ['Skyview Temple Small Key', 'Skyview Small Key'],
    ['Song of the Hero Part', 'Faron Song of the Hero Part'],
]);

const specialTokenAliases = new Map([
    ['Goddesss_Harp', "Goddess's Harp"],
    ['Water_Dragons_Scale', "Water Dragon's Scale"],
]);

function requireFile(filePath, description) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${description} not found at ${filePath}`);
    }
}

function readYaml(filePath) {
    // Upstream occasionally contains a duplicated metadata key. Its own YAML
    // loader accepts the last value, so mirror that behavior for generated data.
    return yaml.load(fs.readFileSync(filePath, 'utf8'), { json: true });
}

function parsePythonStringList(value) {
    const result = [];
    const stringRegex = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
    for (const match of value.matchAll(stringRegex)) {
        result.push((match[1] ?? match[2]).replace(/\\'/g, "'"));
    }
    return result;
}

function parseApworldLocations(filePath) {
    requireFile(filePath, 'SSHD APWorld Locations.py');

    const text = fs.readFileSync(filePath, 'utf8');
    const locationRegex =
        /^    "((?:\\"|[^"])*)": SSHDLocation\("((?:\\"|[^"])*)", (\d+), "((?:\\"|[^"])*)", "((?:\\"|[^"])*)", (.+)\),$/gm;
    const locations = [];

    for (const match of text.matchAll(locationRegex)) {
        locations.push({
            name: match[1],
            code: Number(match[3]),
            region: match[4],
            originalItem: match[5],
            types: parsePythonStringList(match[6]),
        });
    }

    if (locations.length === 0) {
        throw new Error(`No SSHD APWorld locations found in ${filePath}`);
    }

    return locations;
}

function normalizeToken(value) {
    return String(value)
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function itemRequirementName(itemName, count = 1) {
    return count > 1 ? `${itemName} x ${count}` : itemName;
}

function makeFullAreaName(worldName, areaName) {
    return `\\${worldName}\\${areaName}`;
}

function makeCheckId(areaId, locationName) {
    return `${areaId}\\${locationName}`;
}

function addItemWithProgression(rawItems, itemName) {
    const max = progressiveItemMaxes.get(itemName);
    if (max === undefined) {
        rawItems.add(itemName);
        return;
    }

    for (let index = 0; index < max; index++) {
        rawItems.add(`${itemName} #${index}`);
    }
}

function loadItems(randoRoot) {
    const itemsPath = path.join(randoRoot, 'data', 'items.yaml');
    requireFile(itemsPath, 'SSHD rando items.yaml');

    const itemNames = readYaml(itemsPath)
        .map((item) => item.name)
        .filter(Boolean);
    const itemAliasByToken = new Map();

    for (const itemName of itemNames) {
        itemAliasByToken.set(
            normalizeToken(itemName),
            itemNameAliases.get(itemName) ?? itemName,
        );
    }
    for (const [token, itemName] of specialTokenAliases) {
        itemAliasByToken.set(normalizeToken(token), itemName);
    }

    return { itemNames, itemAliasByToken };
}

function loadRandoLocations(randoRoot) {
    const locationsPath = path.join(randoRoot, 'data', 'locations.yaml');
    requireFile(locationsPath, 'SSHD rando locations.yaml');

    return new Map(
        readYaml(locationsPath).map((location) => [
            location.name,
            {
                name: location.name,
                originalItem: location.original_item,
                types: location.types ?? [],
            },
        ]),
    );
}

function loadMacros(randoRoot) {
    const macrosPath = path.join(randoRoot, 'data', 'macros.yaml');
    requireFile(macrosPath, 'SSHD rando macros.yaml');

    return readYaml(macrosPath);
}

function loadSettings(randoRoot) {
    const settingsPath = path.join(randoRoot, 'data', 'settings_list.yaml');
    requireFile(settingsPath, 'SSHD rando settings_list.yaml');

    const settings = new Map();
    for (const setting of readYaml(settingsPath)) {
        if (!setting?.name || !Array.isArray(setting.options)) {
            continue;
        }
        settings.set(setting.name, {
            name: setting.name,
            prettyName: setting.pretty_name ?? setting.name,
            defaultOption: String(setting.default_option ?? ''),
            options: setting.options.map((entry) =>
                String(Object.keys(entry)[0]),
            ),
            descriptions: Object.fromEntries(
                setting.options.map((entry) => {
                    const [optionName, description] = Object.entries(entry)[0];
                    return [String(optionName), String(description ?? '')];
                }),
            ),
        });
    }

    return settings;
}

function loadWorldAreas(randoRoot) {
    const worldDir = path.join(randoRoot, 'data', 'world');
    if (!fs.existsSync(worldDir)) {
        throw new Error(
            `SSHD rando world logic directory not found at ${worldDir}`,
        );
    }

    const areas = [];
    for (const fileName of fs
        .readdirSync(worldDir)
        .filter((entry) => entry.endsWith('.yaml'))
        .sort()) {
        const worldName = path.basename(fileName, '.yaml');
        for (const area of readYaml(path.join(worldDir, fileName))) {
            areas.push({ ...area, worldName });
        }
    }

    return areas;
}

function loadEntranceShuffleData(randoRoot) {
    const entranceDataPath = path.join(
        randoRoot,
        'data',
        'entrance_shuffle_data.yaml',
    );
    requireFile(entranceDataPath, 'SSHD entrance shuffle data');
    return readYaml(entranceDataPath);
}

function buildLocationAccesses(worldAreas) {
    const accesses = new Map();
    for (const area of worldAreas) {
        for (const [locationName, requirement] of Object.entries(
            area.locations ?? {},
        )) {
            const list = accesses.get(locationName) ?? [];
            list.push({ area, requirement: String(requirement) });
            accesses.set(locationName, list);
        }
    }
    return accesses;
}

function eventRequirementName(eventName) {
    return `\\${eventName.replace(/_/g, ' ')}`;
}

function buildEventAliases(worldAreas) {
    const eventAliasesByToken = new Map();
    for (const area of worldAreas) {
        for (const eventName of Object.keys(area.events ?? {})) {
            eventAliasesByToken.set(
                normalizeToken(eventName),
                eventRequirementName(eventName),
            );
        }
    }
    return eventAliasesByToken;
}

function splitRequirementTokens(requirement) {
    return [
        ...new Set(
            requirement
                .replace(/"[^"]*"/g, ' ')
                .replace(/'([^']+)'/g, '$1')
                .replace(
                    /\b(?:and|or|not|Nothing|Impossible|True|False)\b/g,
                    ' ',
                )
                .match(/[A-Za-z_][A-Za-z0-9_']*/g) ?? [],
        ),
    ];
}

function makeRequirementConverter({
    macroNamesByToken,
    itemAliasByToken,
    eventAliasesByToken,
    areaIdsByName,
    settingsByName,
}) {
    const makeSettingRequirement = (settingName, operator, comparedValue) =>
        `\\SSHD Setting\\${settingName} ${operator} ${comparedValue}`;

    const makePlaceholderStore = () => {
        const placeholders = [];
        return {
            hold(value) {
                const placeholder = `@@${placeholders.length}@@`;
                placeholders.push([placeholder, value]);
                return placeholder;
            },
            restore(requirement) {
                let result = requirement;
                for (const [placeholder, value] of placeholders) {
                    result = result.replaceAll(placeholder, value);
                }
                return result;
            },
        };
    };

    const convertBareToken = (token) => {
        if (token === 'Nothing' || token === 'True') {
            return 'True';
        }
        if (token === 'Impossible' || token === 'False') {
            return 'False';
        }

        const macroName = macroNamesByToken.get(normalizeToken(token));
        if (macroName) {
            return `\\${macroName}`;
        }

        const eventName = eventAliasesByToken.get(normalizeToken(token));
        if (eventName) {
            return eventName;
        }

        const itemName = itemAliasByToken.get(normalizeToken(token));
        if (itemName) {
            return itemName;
        }

        if (settingsByName.has(token)) {
            return makeSettingRequirement(token, '==', 'on');
        }

        return token;
    };

    const convertCanAccess = (areaName) => {
        const areaIds = areaIdsByName.get(areaName.trim()) ?? [];
        if (areaIds.length === 1) {
            return areaIds[0];
        }
        return areaName.trim().replace(/\s+/g, '_');
    };

    return (requirement) => {
        const placeholders = makePlaceholderStore();
        const hold = (value) => placeholders.hold(value);

        let converted = String(requirement)
            .replace(/"([^"]+)"/g, '$1')
            .replace(/'([^']+)'/g, (_match, token) =>
                hold(convertBareToken(token)),
            )
            .replace(
                /count\((\d+),\s*([A-Za-z_][A-Za-z0-9_]*)\)/g,
                (_match, count, token) =>
                    hold(itemRequirementName(convertBareToken(token), count)),
            )
            .replace(/wallet_capacity\((\d+)\)/g, (_match, amount) =>
                hold(`\\Wallet Capacity ${amount}`),
            )
            .replace(/gratitude_crystals\((\d+)\)/g, (_match, amount) =>
                hold(`\\${amount} Gratitude Crystals`),
            )
            .replace(/can_access\(([^)]+)\)/g, (_match, areaName) =>
                hold(convertCanAccess(areaName)),
            )
            .replace(
                /\b([A-Za-z_][A-Za-z0-9_]*)\s*(==|!=|>=|<=)\s*([A-Za-z0-9_.'"-]+)/g,
                (match, settingName, operator, comparedValue) => {
                    if (!settingsByName.has(settingName)) {
                        return match;
                    }
                    const normalizedValue = String(comparedValue).replace(
                        /^['"]|['"]$/g,
                        '',
                    );
                    return hold(
                        makeSettingRequirement(
                            settingName,
                            operator,
                            normalizedValue,
                        ),
                    );
                },
            )
            .replace(/\bNothing\b/g, 'True')
            .replace(/\bImpossible\b/g, 'False')
            .replace(/\bTrue\b/g, 'True')
            .replace(/\bFalse\b/g, 'False')
            .replace(/\band\b/g, '&')
            .replace(/\bor\b/g, '|')
            .replace(/\bnot\b/g, 'False &')
            .replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) =>
                hold(convertBareToken(token)),
            );

        converted = placeholders.restore(converted);
        return converted;
    };
}

function extractRequirementAtoms(requirement) {
    return String(requirement)
        .split(/\s*([(&|)])\s*/g)
        .map((part) => part.trim())
        .filter(
            (part) =>
                part && !['(', ')', '&', '|', 'True', 'False'].includes(part),
        );
}

function getLocationType(types) {
    if (types.some((type) => type.includes('Rupees'))) {
        return 'Rupees';
    }
    if (types.some((type) => type.includes('Dusk Relic'))) {
        return 'silent realm';
    }
    if (types.some((type) => type.includes('Gratitude Crystals'))) {
        return 'Loose Crystals';
    }
    if (types.some((type) => type.includes("Beedle's Airshop"))) {
        return "Beedle's Airshop, Shop Purchases";
    }
    if (types.some((type) => type.includes('Tadtones'))) {
        return 'Tadtones';
    }
    return types.join(', ') || null;
}

function inferHintRegion(area, accessLocationNames, apworldLocationsByName) {
    if (area.hint_region) {
        return area.hint_region;
    }
    if (area.hard_assigned_region && area.hard_assigned_region !== 'None') {
        return area.hard_assigned_region;
    }

    for (const locationName of accessLocationNames) {
        const apworldLocation = apworldLocationsByName.get(locationName);
        if (apworldLocation) {
            return apworldLocation.region;
        }
    }

    return (
        {
            Skyloft: 'Upper Skyloft',
            Sky: 'Sky',
            Faron: 'Faron Woods',
            Eldin: 'Eldin Volcano',
            Lanayru: 'Lanayru Desert',
        }[area.worldName] ?? area.worldName
    );
}

function getPrimaryAccessByLocation(apworldLocations, locationAccesses) {
    const result = new Map();
    for (const location of apworldLocations) {
        const accesses = locationAccesses.get(location.name) ?? [];
        if (accesses.length === 0) {
            throw new Error(
                `No SSHD rando world logic access for ${location.name}`,
            );
        }
        result.set(location.name, accesses[0]);
    }
    return result;
}

function addSkyTravelRequirements(area, targetAreaName, requirement) {
    const terms = [];
    if (area.name === 'The Sky' || targetAreaName === 'The Sky') {
        terms.push('Loftwing');
    }
    if (
        area.name === 'The Sky' &&
        (targetAreaName.endsWith(' Pillar') ||
            ['Upper Skyloft', 'Central Skyloft', 'Skyloft Village'].includes(
                targetAreaName,
            ))
    ) {
        terms.push('Sailcloth');
    }
    if (terms.length === 0) {
        return String(requirement);
    }
    return `${terms.join(' and ')} and (${String(requirement)})`;
}

function buildSshdDump() {
    const apworldLocations = parseApworldLocations(sshdApworldLocationsPath);
    const apworldLocationsByName = new Map(
        apworldLocations.map((location) => [location.name, location]),
    );
    const randoLocations = loadRandoLocations(sshdRandoRoot);
    const worldAreas = loadWorldAreas(sshdRandoRoot);
    const entranceShuffleData = loadEntranceShuffleData(sshdRandoRoot);
    const locationAccesses = buildLocationAccesses(worldAreas);
    const eventAliasesByToken = buildEventAliases(worldAreas);
    const primaryAccessByLocation = getPrimaryAccessByLocation(
        apworldLocations,
        locationAccesses,
    );
    const macros = loadMacros(sshdRandoRoot);
    const settingsByName = loadSettings(sshdRandoRoot);
    const macroNamesByToken = new Map(
        Object.keys(macros).map((macroName) => [
            normalizeToken(macroName),
            macroName,
        ]),
    );
    const { itemNames, itemAliasByToken } = loadItems(sshdRandoRoot);
    const areaIdsByName = new Map();
    for (const area of worldAreas) {
        const areaId = makeFullAreaName(area.worldName, area.name);
        const areaIds = areaIdsByName.get(area.name) ?? [];
        areaIds.push(areaId);
        areaIdsByName.set(area.name, areaIds);
    }
    const convertRequirement = makeRequirementConverter({
        macroNamesByToken,
        itemAliasByToken,
        eventAliasesByToken,
        areaIdsByName,
        settingsByName,
    });

    const checks = {};
    const rawItems = new Set(['Day', 'Night', 'True', 'False']);
    for (const itemName of itemNames) {
        addItemWithProgression(
            rawItems,
            itemNameAliases.get(itemName) ?? itemName,
        );
    }
    // Loftwing is an AP item even in backend revisions where it is not yet
    // present in data/items.yaml.
    rawItems.add('Loftwing');

    const locationNameToCheckId = new Map();
    for (const location of apworldLocations) {
        const primaryAccess = primaryAccessByLocation.get(location.name);
        const primaryAreaId = makeFullAreaName(
            primaryAccess.area.worldName,
            primaryAccess.area.name,
        );
        const checkId = makeCheckId(primaryAreaId, location.name);
        const randoLocation = randoLocations.get(location.name);
        const types = randoLocation?.types ?? location.types;
        locationNameToCheckId.set(location.name, checkId);
        checks[checkId] = {
            'original item':
                randoLocation?.originalItem ?? location.originalItem,
            type: getLocationType(types),
            short_name: location.name,
        };
        rawItems.add(checkId);
    }

    const areasByWorld = new Map();
    const areasByName = new Map();
    const areaIdByRandoArea = new Map();
    for (const area of worldAreas) {
        const areaId = makeFullAreaName(area.worldName, area.name);
        areaIdByRandoArea.set(area, areaId);
        const namedAreas = areasByName.get(area.name) ?? [];
        namedAreas.push(area);
        areasByName.set(area.name, namedAreas);
        rawItems.add(areaId);
        rawItems.add(`${areaId}_DAY`);
        rawItems.add(`${areaId}_NIGHT`);
        for (const eventName of Object.keys(area.events ?? {})) {
            rawItems.add(eventRequirementName(eventName));
        }
        if (!areasByWorld.has(area.worldName)) {
            areasByWorld.set(area.worldName, []);
        }
        areasByWorld.get(area.worldName).push(area);
    }

    const uniqueAreaByName = new Map();
    for (const [areaName, matches] of areasByName) {
        if (matches.length !== 1) {
            throw new Error(
                `Entrance shuffle area ${areaName} is ambiguous (${matches.length} matches)`,
            );
        }
        uniqueAreaByName.set(areaName, matches[0]);
    }

    const shuffleDirections = [];
    const shuffleDirectionByConnection = new Map();
    for (const entry of entranceShuffleData) {
        const entryDirections = [];
        for (const [directionName, primary] of [
            ['forward', true],
            ['return', false],
        ]) {
            const data = entry[directionName];
            if (!data) {
                continue;
            }
            const [sourceName, targetName, ...extra] = data.connection.split(
                ' -> ',
            );
            if (!sourceName || !targetName || extra.length > 0) {
                throw new Error(
                    `Invalid entrance connection: ${data.connection}`,
                );
            }
            const sourceArea = uniqueAreaByName.get(sourceName);
            const targetArea = uniqueAreaByName.get(targetName);
            if (!sourceArea || !targetArea) {
                throw new Error(
                    `Entrance connection area not found: ${data.connection}`,
                );
            }
            if (!Object.hasOwn(sourceArea.exits ?? {}, targetName)) {
                throw new Error(
                    `Entrance connection has no matching world exit: ${data.connection}`,
                );
            }

            const sourceAreaId = areaIdByRandoArea.get(sourceArea);
            const targetAreaId = areaIdByRandoArea.get(targetArea);
            const exitId = `${sourceAreaId}\\Exit to ${targetName}`;
            const entranceName = `Entrance from ${sourceName}`;
            const entranceId = `${targetAreaId}\\${entranceName}`;
            if (shuffleDirectionByConnection.has(data.connection)) {
                throw new Error(
                    `Duplicate entrance connection: ${data.connection}`,
                );
            }
            const direction = {
                type: entry.type,
                primary,
                sourceArea,
                targetArea,
                exitId,
                entranceId,
                entranceName,
                connection: data.connection,
                alias: data.alias ?? data.connection,
                canStartAt: data.can_start_at ?? true,
                stage:
                    data.exit_infos?.[0]?.stage ??
                    data.spawn_info?.[0]?.stage,
                doorCoupleTag: entry.door_couple_tag,
                conditionalVanillaConnections:
                    data.conditional_vanilla_connections ?? [],
            };
            entryDirections.push(direction);
            shuffleDirections.push(direction);
            shuffleDirectionByConnection.set(data.connection, direction);
        }
        if (entryDirections.length === 2) {
            entryDirections[0].reverse = entryDirections[1];
            entryDirections[1].reverse = entryDirections[0];
        }
    }

    const shuffleDirectionsByTargetArea = new Map();
    for (const direction of shuffleDirections) {
        const directions =
            shuffleDirectionsByTargetArea.get(direction.targetArea) ?? [];
        directions.push(direction);
        shuffleDirectionsByTargetArea.set(direction.targetArea, directions);
        rawItems.add(direction.exitId);
        rawItems.add(direction.entranceId);
        rawItems.add(`${direction.entranceId}_DAY`);
        rawItems.add(`${direction.entranceId}_NIGHT`);
    }

    const conditionalVanillaDirections = [];
    const conditionalVanillaByConnection = new Map();
    for (const controller of shuffleDirections) {
        for (const connection of controller.conditionalVanillaConnections) {
            const [sourceName, targetName, ...extra] = connection.split(' -> ');
            if (!sourceName || !targetName || extra.length > 0) {
                throw new Error(
                    `Invalid conditional vanilla connection: ${connection}`,
                );
            }
            const sourceArea = uniqueAreaByName.get(sourceName);
            const targetArea = uniqueAreaByName.get(targetName);
            if (
                !sourceArea ||
                !targetArea ||
                !Object.hasOwn(sourceArea.exits ?? {}, targetName)
            ) {
                throw new Error(
                    `Conditional vanilla connection not found in world: ${connection}`,
                );
            }
            if (conditionalVanillaByConnection.has(connection)) {
                throw new Error(
                    `Duplicate conditional vanilla connection: ${connection}`,
                );
            }
            const sourceAreaId = areaIdByRandoArea.get(sourceArea);
            const targetAreaId = areaIdByRandoArea.get(targetArea);
            const direction = {
                sourceArea,
                targetArea,
                exitId: `${sourceAreaId}\\Exit to ${targetName}`,
                entranceId: `${targetAreaId}\\Entrance from ${sourceName}`,
                entranceName: `Entrance from ${sourceName}`,
                controllerExitId: controller.exitId,
            };
            conditionalVanillaDirections.push(direction);
            conditionalVanillaByConnection.set(connection, direction);
            rawItems.add(direction.exitId);
            rawItems.add(direction.entranceId);
            rawItems.add(`${direction.entranceId}_DAY`);
            rawItems.add(`${direction.entranceId}_NIGHT`);
        }
    }

    const conditionalVanillaDirectionsByTargetArea = new Map();
    for (const direction of conditionalVanillaDirections) {
        const directions =
            conditionalVanillaDirectionsByTargetArea.get(
                direction.targetArea,
            ) ?? [];
        directions.push(direction);
        conditionalVanillaDirectionsByTargetArea.set(
            direction.targetArea,
            directions,
        );
    }

    const startArea = worldAreas.find(
        (area) => area.worldName === 'Skyloft' && area.name === "Link's Spawn",
    );
    if (!startArea) {
        throw new Error("Could not find SSHD rando Link's Spawn area");
    }
    const startAreaId = areaIdByRandoArea.get(startArea);
    const startEntranceId = `${startAreaId}\\Start Entrance`;
    rawItems.add('\\Start');
    rawItems.add(startEntranceId);
    rawItems.add(`${startEntranceId}_DAY`);
    rawItems.add(`${startEntranceId}_NIGHT`);

    const areaAccessLocationNames = new Map();
    for (const [locationName, accesses] of locationAccesses.entries()) {
        for (const access of accesses) {
            const locationNames =
                areaAccessLocationNames.get(access.area) ?? [];
            locationNames.push(locationName);
            areaAccessLocationNames.set(access.area, locationNames);
        }
    }

    const makeRawArea = (area) => {
        const areaId = areaIdByRandoArea.get(area);
        const resolveExitTarget = (exitName) => {
            const sameWorldTarget = worldAreas.find(
                (candidate) =>
                    candidate.worldName === area.worldName &&
                    candidate.name === exitName,
            );
            if (sameWorldTarget) {
                return sameWorldTarget;
            }

            const byName = areasByName.get(exitName) ?? [];
            if (byName.length === 1) {
                return byName[0];
            }
            if (byName.length > 1) {
                throw new Error(
                    `Ambiguous cross-world exit ${area.worldName}:${area.name} -> ${exitName}`,
                );
            }
            return undefined;
        };
        const rawArea = {
            name: areaId,
            abstract: false,
            can_sleep: area.can_sleep ?? false,
            hint_region:
                area === startArea
                    ? 'Upper Skyloft'
                    : inferHintRegion(
                          area,
                          areaAccessLocationNames.get(area) ?? [],
                          apworldLocationsByName,
                      ),
            allowed_time_of_day:
                timeOfDay[area.allowed_time_of_day ?? 'All'] ?? timeOfDay.All,
            entrances: [],
            exits: {},
            sub_areas: {},
            locations: {},
        };

        if (area === startArea) {
            rawArea.entrances.push('Start Entrance');
        }
        for (const direction of shuffleDirectionsByTargetArea.get(area) ?? []) {
            rawArea.entrances.push(direction.entranceName);
        }
        for (const direction of
            conditionalVanillaDirectionsByTargetArea.get(area) ?? []) {
            rawArea.entrances.push(direction.entranceName);
        }

        for (const [exitName, requirement] of Object.entries(
            area.exits ?? {},
        )) {
            const adjustedRequirement = addSkyTravelRequirements(
                area,
                exitName,
                requirement,
            );
            const shuffleDirection = shuffleDirectionByConnection.get(
                `${area.name} -> ${exitName}`,
            );
            if (shuffleDirection) {
                rawArea.exits[shuffleDirection.exitId] = convertRequirement(
                    adjustedRequirement,
                );
                continue;
            }
            const conditionalDirection =
                conditionalVanillaByConnection.get(
                    `${area.name} -> ${exitName}`,
                );
            if (conditionalDirection) {
                rawArea.exits[conditionalDirection.exitId] =
                    convertRequirement(adjustedRequirement);
                continue;
            }
            const targetArea = resolveExitTarget(exitName);
            if (targetArea) {
                rawArea.exits[areaIdByRandoArea.get(targetArea)] =
                    convertRequirement(adjustedRequirement);
            }
        }

        for (const [eventName, requirement] of Object.entries(
            area.events ?? {},
        )) {
            rawArea.locations[eventRequirementName(eventName)] =
                convertRequirement(String(requirement));
        }

        for (const [locationName, requirement] of Object.entries(
            area.locations ?? {},
        )) {
            if (!apworldLocationsByName.has(locationName)) {
                continue;
            }
            const checkId = locationNameToCheckId.get(locationName);
            const primaryAccess = primaryAccessByLocation.get(locationName);
            const locationKey =
                primaryAccess.area === area ? locationName : checkId;
            rawArea.locations[locationKey] = convertRequirement(
                String(requirement),
            );
        }

        return rawArea;
    };

    const rootLocations = {};
    for (const [macroName, requirement] of Object.entries(macros)) {
        const convertedRequirement = convertRequirement(String(requirement));
        rootLocations[`\\${macroName}`] = convertedRequirement;
        rawItems.add(`\\${macroName}`);
        for (const atom of extractRequirementAtoms(convertedRequirement)) {
            rawItems.add(atom);
        }
    }
    const walletCapacityRequirement = (amount) => {
        const baseWallets = [300, 500, 1000, 5000, 9000];
        const alternatives = [];
        for (
            let progressiveWallets = 0;
            progressiveWallets < baseWallets.length;
            progressiveWallets++
        ) {
            for (let extraWallets = 0; extraWallets <= 3; extraWallets++) {
                if (
                    baseWallets[progressiveWallets] + extraWallets * 300 <
                    amount
                ) {
                    continue;
                }
                const terms = [];
                if (progressiveWallets > 0) {
                    terms.push(
                        itemRequirementName(
                            'Progressive Wallet',
                            progressiveWallets,
                        ),
                    );
                }
                if (extraWallets > 0) {
                    terms.push(
                        itemRequirementName('Extra Wallet', extraWallets),
                    );
                }
                alternatives.push(terms.length ? terms.join(' & ') : 'True');
            }
        }
        return alternatives.join(' | ') || 'False';
    };

    for (const amount of [50, 100, 300, 600, 800, 1000, 1200, 1600]) {
        const requirement = walletCapacityRequirement(amount);
        rootLocations[`\\Wallet Capacity ${amount}`] = requirement;
        rawItems.add(`\\Wallet Capacity ${amount}`);
        for (const atom of extractRequirementAtoms(requirement)) {
            rawItems.add(atom);
        }
    }
    for (const amount of [5, 10, 30, 40, 50, 70, 80]) {
        const requirement = itemRequirementName('Gratitude Crystal', amount);
        rootLocations[`\\${amount} Gratitude Crystals`] = requirement;
        rawItems.add(`\\${amount} Gratitude Crystals`);
        rawItems.add(requirement);
    }

    for (const area of worldAreas) {
        for (const requirement of [
            ...Object.values(area.exits ?? {}),
            ...Object.values(area.locations ?? {}),
            ...Object.values(area.events ?? {}),
        ]) {
            const convertedRequirement = convertRequirement(
                String(requirement),
            );
            for (const atom of extractRequirementAtoms(convertedRequirement)) {
                rawItems.add(atom);
            }
        }
    }

    const areas = {
        name: '\\',
        abstract: true,
        can_sleep: false,
        hint_region: null,
        allowed_time_of_day: timeOfDay.All,
        entrances: [],
        exits: {
            '\\Start': 'True',
        },
        sub_areas: {},
        locations: rootLocations,
    };

    for (const [worldName, worldAreas_] of areasByWorld.entries()) {
        const worldAreaId = `\\${worldName}`;
        rawItems.add(worldAreaId);
        areas.sub_areas[worldName] = {
            name: worldAreaId,
            abstract: true,
            can_sleep: false,
            hint_region: null,
            allowed_time_of_day: timeOfDay.All,
            entrances: [],
            exits: {},
            sub_areas: Object.fromEntries(
                worldAreas_.map((area) => [area.name, makeRawArea(area)]),
            ),
            locations: {},
        };
    }

    const rawExits = {
        '\\Start': {
            type: 'exit',
            'can-start-at': undefined,
            allowed_time_of_day: timeOfDay.All,
            subtype: undefined,
            stage: undefined,
            province: undefined,
            short_name: 'Start',
            vanilla: startEntranceId,
        },
    };
    const rawEntrances = {
        [startEntranceId]: {
            type: 'entrance',
            'can-start-at': true,
            allowed_time_of_day: timeOfDay.All,
            subtype: undefined,
            stage: undefined,
            province: undefined,
            short_name: 'SSHD Start Entrance',
        },
    };
    const entranceConnections = {};
    for (const direction of shuffleDirections) {
        rawExits[direction.exitId] = {
            type: 'exit',
            allowed_time_of_day:
                timeOfDay[
                    direction.sourceArea.allowed_time_of_day ?? 'All'
                ] ?? timeOfDay.All,
            stage: direction.stage,
            short_name: direction.alias,
            vanilla: direction.entranceId,
        };
        rawEntrances[direction.entranceId] = {
            type: 'entrance',
            'can-start-at': direction.canStartAt,
            allowed_time_of_day:
                timeOfDay[
                    direction.targetArea.allowed_time_of_day ?? 'All'
                ] ?? timeOfDay.All,
            subtype:
                direction.type === 'Bird Statue'
                    ? 'bird-statue-entrance'
                    : undefined,
            stage: direction.stage,
            province: direction.targetArea.worldName,
            short_name: direction.alias,
        };
        entranceConnections[direction.exitId] = {
            type: direction.type,
            entrance: direction.entranceId,
            primary: direction.primary,
            reverse_exit: direction.reverse?.exitId,
            reverse_entrance: direction.reverse?.entranceId,
            door_couple_tag: direction.doorCoupleTag,
        };
    }
    const conditionalVanillaConnections = {};
    for (const direction of conditionalVanillaDirections) {
        rawExits[direction.exitId] = {
            type: 'exit',
            allowed_time_of_day:
                timeOfDay[
                    direction.sourceArea.allowed_time_of_day ?? 'All'
                ] ?? timeOfDay.All,
            short_name: `${direction.sourceArea.name} -> ${direction.targetArea.name}`,
            vanilla: direction.entranceId,
        };
        rawEntrances[direction.entranceId] = {
            type: 'entrance',
            'can-start-at': false,
            allowed_time_of_day:
                timeOfDay[
                    direction.targetArea.allowed_time_of_day ?? 'All'
                ] ?? timeOfDay.All,
            province: direction.targetArea.worldName,
            short_name: direction.targetArea.name,
        };
        conditionalVanillaConnections[direction.exitId] =
            direction.controllerExitId;
    }

    return {
        items: [...rawItems].sort(),
        checks,
        gossip_stones: {},
        exits: rawExits,
        entrances: rawEntrances,
        entrance_connections: entranceConnections,
        conditional_vanilla_connections: conditionalVanillaConnections,
        areas,
        linked_entrances: {
            silent_realms: {},
            dungeons: {},
        },
        dungeon_completion_requirements: {},
    };
}

function snakeToKebab(value) {
    return value.replace(/_/g, '-');
}

function buildSshdOptions() {
    const baseOptionsPath = 'testData/options.yaml';
    requireFile(baseOptionsPath, 'base tracker options.yaml');

    const baseOptions = readYaml(baseOptionsPath);
    const settingsByName = loadSettings(sshdRandoRoot);
    const optionsByCommand = new Map(
        baseOptions.map((option) => [option.command, option]),
    );

    for (const setting of settingsByName.values()) {
        if (!setting.options.length) {
            continue;
        }
        const command = snakeToKebab(setting.name);
        const help = setting.options
            .map((optionName) => {
                const description = setting.descriptions[optionName];
                return description
                    ? `${optionName}: ${description}`
                    : optionName;
            })
            .join(' ');
        const rangeMatch =
            setting.options.length === 1 &&
            setting.options[0].match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const min = Number(rangeMatch[1]);
            const max = Number(rangeMatch[2]);
            optionsByCommand.set(command, {
                name: setting.prettyName,
                command,
                type: 'int',
                min,
                max,
                default: Number(setting.defaultOption || min),
                bits: Math.max(1, Math.ceil(Math.log2(max + 1))),
                help,
            });
        } else {
            optionsByCommand.set(command, {
                name: setting.prettyName,
                command,
                type: 'singlechoice',
                choices: setting.options,
                default: setting.defaultOption || setting.options[0],
                bits: Math.max(
                    1,
                    Math.ceil(Math.log2(Math.max(1, setting.options.length))),
                ),
                help,
            });
        }
    }

    return [...optionsByCommand.values()];
}

const dump = buildSshdDump();
fs.writeFileSync(outputPath, yaml.dump(dump, { lineWidth: 100 }));
const options = buildSshdOptions();
fs.writeFileSync(optionsOutputPath, yaml.dump(options, { lineWidth: 100 }));
console.log(
    `Wrote ${outputPath} with ${Object.keys(dump.checks).length} checks and ${dump.items.length} items/logic nodes`,
);
console.log(`Wrote ${optionsOutputPath} with ${options.length} options`);
