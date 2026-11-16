import eldinImage from '../assets/maps/Eldin.png';
import faronImage from '../assets/maps/Faron.png';
import lanayruImage from '../assets/maps/Lanayru.png';
import skyImage from '../assets/maps/Sky.png';
import skyloftImage from '../assets/maps/Skyloft.png';
import mapData from '../data/mapData.json';
import stageToRegion from '../data/stageToRegion.json';
import type { Logic } from '../logic/Logic';
import type { CheckMarker, MapDocument, PackMap } from './pack';

const dungeonRegions: Record<string, string> = {
    Skyview: 'Skyview',
    'Ancient Cistern': 'Ancient Cistern',
    'Earth Temple': 'Earth Temple',
    'Fire Sanctuary': 'Fire Sanctuary',
    'Lanayru Mining Facility': 'Lanayru Mining Facility',
    Sandship: 'Sandship',
    'Sky Keep': 'Sky Keep',
    'Skyloft Silent Realm': "The Goddess's Silent Realm",
    'Faron Silent Realm': "Farore's Silent Realm",
    'Eldin Silent Realm': "Din's Silent Realm",
    'Lanayru Silent Realm': "Nayru's Silent Realm",
};

/** Preserve the V1 geographic grouping. Coordinates remain percentages converted to native pixels. */
export function legacyDocument(logic: Logic): MapDocument {
    const assigned = new Set<string>();
    let sequence = 0;
    const marker = (
        region: string,
        x: number,
        y: number,
    ): CheckMarker | undefined => {
        const checkIds = (logic.checksByHintRegion[region] ?? []).filter(
            (id) => !assigned.has(id),
        );
        if (!checkIds.length) return undefined;
        for (const id of checkIds) assigned.add(id);
        return {
            id: `region-${sequence++}`,
            kind: 'checks',
            label: region,
            x: (x * 843) / 100,
            y: (y * 465) / 100,
            checkIds,
            showNameOnHover: true,
        };
    };
    const root: PackMap = {
        id: 'world',
        name: 'The Sky',
        image: 'images/world.png',
        width: 843,
        height: 465,
        entranceIds: [],
        markers: [],
    };
    const provinces = [
        ['skyloftSubmap', 'skyloft', skyloftImage],
        ['faronSubmap', 'faron', faronImage],
        ['eldinSubmap', 'eldin', eldinImage],
        ['lanayruSubmap', 'lanayru', lanayruImage],
    ] as const;
    const images: Record<string, string> = { 'images/world.png': skyImage };
    const maps = provinces.map(([key, id, image]): PackMap => {
        const province = mapData[key];
        images[`images/${id}.png`] = image;
        root.markers.push({
            id: `to-${id}`,
            kind: 'link',
            navigation: 'child',
            label: province.name,
            x: (province.markerX * 843) / 100,
            y: (province.markerY * 465) / 100,
            targetMapId: id,
        });
        const markers = province.markers.flatMap(
            (entry) => marker(entry.region, entry.markerX, entry.markerY) ?? [],
        );
        markers.push(
            ...province.entranceMarkers.flatMap(
                (entry) =>
                    marker(
                        dungeonRegions[entry.entryName] ?? entry.entryName,
                        entry.markerX,
                        entry.markerY,
                    ) ?? [],
            ),
        );
        return {
            id,
            name: province.name,
            image: `images/${id}.png`,
            width: 843,
            height: 465,
            entranceIds: [],
            markers: [
                {
                    id: 'back-to-sky',
                    kind: 'link',
                    navigation: 'back',
                    label: 'Back to Sky',
                    x: 55,
                    y: 35,
                    targetMapId: 'world',
                },
                ...markers,
            ],
        };
    });
    for (const entry of [mapData.sky, mapData.thunderhead]) {
        const group = marker(entry.region, entry.markerX, entry.markerY);
        if (group) root.markers.push(group);
    }
    const leftovers = Object.keys(logic.checks).filter(
        (id) => !assigned.has(id),
    );
    if (leftovers.length)
        root.markers.push({
            id: 'others',
            kind: 'checks',
            label: 'Others',
            x: (mapData.others.markerX * 843) / 100,
            y: (mapData.others.markerY * 465) / 100,
            checkIds: leftovers,
            showNameOnHover: true,
        });
    for (const [stage, region] of Object.entries({
        F000: 'Central Skyloft',
        ...stageToRegion,
    })) {
        const owner = [root, ...maps].find((map) =>
            map.markers.some(
                (marker) => marker.kind === 'checks' && marker.label === region,
            ),
        );
        if (owner) (owner.trackingRules ??= []).push({ stage });
    }
    return {
        pack: {
            version: 1,
            id: 'sshd-v2-v1-layout',
            name: 'SSHD · V1 Map Layout',
            maps: [root, ...maps],
        },
        images,
    };
}
