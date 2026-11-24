import { strFromU8, unzipSync } from 'fflate';
import { load } from 'js-yaml';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseLogic } from '../src/logic/Logic';
import type { RawLogic } from '../src/logic/UpstreamTypes';
import { applyDefaultPackEntrances } from '../src/v2/defaultPackEntrances';
import { applyDefaultTrackingRules } from '../src/v2/defaultPackTracking';
import { gameAreas } from '../src/v2/gameAreas';
import type { LocationRule } from '../src/v2/locationTracking';
import { parsePack } from '../src/v2/pack';

const reportPath = 'docs/V2_PACK_CHECKLIST.md';
const archive = Buffer.concat(
    [1, 2].map((part) =>
        readFileSync(`src/v2/data/default-map-pack.zip.${part}`),
    ),
);
const manifest = unzipSync(archive, {
    filter: ({ name }) => name === 'pack.json',
});
const { areaGraph: graph } = parseLogic(
    load(readFileSync('testData/sshd-dump.yaml', 'utf8')) as RawLogic,
);
const pack = parsePack(
    applyDefaultPackEntrances(
        applyDefaultTrackingRules(
            parsePack(JSON.parse(strFromU8(manifest['pack.json']))),
        ),
        graph,
    ),
);

const mapsById = new Map(pack.maps.map((map) => [map.id, map]));
const arrivalOwners = new Map(
    pack.maps.flatMap((map) => map.entranceIds.map((id) => [id, map] as const)),
);
const links = pack.maps.flatMap((map) =>
    map.markers.flatMap((marker) =>
        marker.kind === 'link' ? [{ map, marker }] : [],
    ),
);
const linkedExits = new Set(
    links.flatMap(({ marker }) => (marker.exitId ? [marker.exitId] : [])),
);
const boundMarkerCount = links.filter(({ marker }) => marker.exitId).length;
const tracking = pack.maps.flatMap((map) =>
    (map.trackingRules ?? []).map((rule) => ({ map, rule })),
);
const stageNames = new Set([
    ...Object.keys(gameAreas),
    ...tracking.map(({ rule }) => rule.stage),
]);
const untrackedStages = [...stageNames]
    .sort()
    .filter((stage) => !tracking.some(({ rule }) => rule.stage === stage));

const escape = (value: string | number) =>
    String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const code = (value: string) => '`' + value + '`';
const table = (header: string[], rows: (string | number)[][]) =>
    rows.length
        ? [
              header.join(' | '),
              header.map(() => '---').join(' | '),
              ...rows.map((row) => row.map(escape).join(' | ')),
              '',
          ].join('\n')
        : '_None._\n';
const coordinates = ({ x, y }: { x: number; y: number }) =>
    `${Math.round(x)}, ${Math.round(y)}`;
const ruleDescription = ({ stage, room, layer, entrance }: LocationRule) =>
    [
        code(stage),
        room === undefined ? '' : `room ${room}`,
        layer === undefined ? '' : `layer ${layer}`,
        entrance === undefined ? '' : `entrance ${entrance}`,
    ]
        .filter(Boolean)
        .join(', ');

const tasks = {
    verify: [] as string[][],
    add: [] as string[][],
    logical: [] as string[][],
};
const arrivalsToAdd: string[][] = [];
for (const [id, exit] of Object.entries(graph.exits)) {
    if (linkedExits.has(id)) continue;
    const connection = Object.hasOwn(graph.entranceConnections, id)
        ? graph.entranceConnections[id]
        : undefined;
    const kind =
        connection?.type ??
        (graph.conditionalVanillaConnections[id] ? 'Conditional' : 'Logical');
    const arrivalId = graph.vanillaConnections[id];
    const target = arrivalOwners.get(arrivalId);
    const returnId =
        connection?.reverse_entrance ??
        (connection?.reverse_exit &&
            graph.vanillaConnections[connection.reverse_exit]);
    const source = returnId ? arrivalOwners.get(returnId) : undefined;
    const candidates =
        source && target
            ? links.filter(
                  ({ map, marker }) =>
                      map.id === source.id &&
                      marker.targetMapId === target.id &&
                      !marker.exitId &&
                      marker.navigation !== 'back' &&
                      !marker.label.startsWith('Back to '),
              )
            : [];
    const area = exit.short_name.split(' -> ')[0];
    const row = [
        exit.short_name,
        kind,
        source?.name ?? `${area} (game area)`,
        target?.name ?? 'Unassigned',
        code(id),
    ];
    if (
        kind === 'Spawn' ||
        kind === 'Bird Statue' ||
        kind.endsWith('Region Entrance') ||
        kind === 'Logical'
    ) {
        tasks.logical.push([
            ...row,
            kind === 'Bird Statue'
                ? 'Landing only; keep province shortcuts fixed'
                : 'No physical marker planned',
        ]);
    } else if (candidates.length) {
        tasks.verify.push([
            ...row,
            candidates
                .map(({ marker }) => `${marker.label} (${coordinates(marker)})`)
                .join('; '),
        ]);
    } else {
        tasks.add.push([
            ...row,
            [
                !source && 'Source map not confirmed',
                !target && 'Assign arrival',
                'Place or identify physical marker',
            ]
                .filter(Boolean)
                .join('; '),
        ]);
    }
}
for (const [id, arrival] of Object.entries(graph.entrances)) {
    if (arrivalOwners.has(id)) continue;
    arrivalsToAdd.push([
        arrival.short_name,
        code(id),
        arrival.short_name === 'SSHD Start Entrance'
            ? 'Synthetic; intentionally unassigned'
            : 'Add destination map or confirm a shared one',
    ]);
}

const exitColumns = [
    'Game exit',
    'Type',
    'Source',
    'Vanilla arrival map',
    'Exit ID',
];
const overviewMaps = new Set(['faron', 'eldin', 'lanayru']);
const missingRules = pack.maps.filter((map) => !map.trackingRules?.length);
const rulelessGameplayMaps = missingRules.filter(
    (map) => !overviewMaps.has(map.id),
);
const bindingsToReview = links.flatMap(({ map, marker }) => {
    if (!marker.exitId) return [];
    const exit = graph.exits[marker.exitId];
    const arrival = arrivalOwners.get(graph.vanillaConnections[marker.exitId]);
    const issue = !exit
        ? 'Unknown exit ID'
        : !arrival
          ? 'Vanilla arrival has no map'
          : marker.targetMapId && arrival.id !== marker.targetMapId
            ? `Vanilla arrival is assigned to ${arrival.name}, not the authored target`
            : undefined;
    return issue
        ? [
              [
                  map.name,
                  `${marker.label} (${coordinates(marker)})`,
                  code(marker.exitId),
                  issue,
              ],
          ]
        : [];
});
const text = [
    '# V2 Pack Association Checklist',
    '',
    '<!-- Generated by npm run audit:v2Pack. Record lasting decisions in V2_DEFAULT_PACK.md, not here. -->',
    '',
    `Default pack: **${pack.name}**. ${boundMarkerCount}/${links.length} markers bound to game exits; ${arrivalOwners.size}/${Object.keys(graph.entrances).length} arrival IDs assigned; ${pack.maps.length - missingRules.length}/${pack.maps.length} maps with player-following rules (${tracking.length} rules).`,
    '',
    `- [Links to verify](#links-to-verify) (${tasks.verify.length}) and [links to add](#links-to-add) (${tasks.add.length})`,
    `- [Arrivals without a map](#arrivals-without-a-map) (${arrivalsToAdd.length}, including intentional exclusions)`,
    `- [Player following to verify](#player-following-to-verify) and [gameplay maps without rules](#maps-without-rules) (${rulelessGameplayMaps.length})`,
    '- [Complete inventories](#complete-inventories)',
    '',
    'Use **Game entrance → Game exit** on the source marker and **Configure associations → Entrance destinations** on the arrival map. Search by the exit/arrival name or copy the exact ID from the table. Marker coordinates are in pack pixels. Candidate links are suggestions for manual verification, not automatic assignments.',
    '',
    '## Links to verify',
    '',
    table([...exitColumns, 'Existing marker candidates (X, Y)'], tasks.verify),
    '## Links to add',
    '',
    'No confirmed physical marker exists for these directions. Keep overview and Back to links fixed.',
    '',
    table([...exitColumns, 'Next action'], tasks.add),
    '### Existing bindings to review',
    '',
    table(
        ['Source map', 'Marker (X, Y)', 'Exit ID', 'Issue'],
        bindingsToReview,
    ),
    '## Arrivals without a map',
    '',
    table(['Arrival', 'Arrival ID', 'Next action'], arrivalsToAdd),
    '## Player following to verify',
    '',
    'In **Configure associations → Player following**, use the observed stage code first. Add room, layer or entrance only if needed. Record real telemetry in Tools → Debug → Player tracking. The whole inventory below is authored, not yet certified in a live Rust session.',
    '',
    table(
        ['Target or case', 'Location data to compare', 'What to check'],
        [
            [
                'All suffixed stages',
                'Full stage code such as `F201_1`',
                'Confirm the Rust payload includes the suffix and publishes an initial location plus updates.',
            ],
            [
                "Sky Keep and the Goddess's and Din's Silent Realms",
                '`D003_0` through `D003_8`, `S000`, `S200`',
                'Verify the three new maps on entry and return. Every Sky Keep room intentionally uses the same map.',
            ],
            [
                "Farore's and Nayru's revised Silent Realms",
                '`S100`, `S300`',
                'Verify that following opens the actual realm after a shuffled trial gate and switches back on return.',
            ],
            [
                'Bug Heaven',
                '`F023`',
                'Compare room and layer against another location in The Thunderhead. Leave on The Sky if indistinguishable.',
            ],
            [
                'Lumpy Pumpkin exterior',
                '`F020` (interior is `F011r`)',
                'Confirm whether there is a stable discriminator from the rest of The Sky.',
            ],
            [
                'Knight Academy F1 and F2',
                '`F001r`, especially room 0',
                'Confirm the per-room rules; do not assign the shared room to a single floor without evidence.',
            ],
            [
                'Ancient Cistern 1F and B1',
                '`D101`, room 4 for B1',
                'Verify room 4 in game and record any other unresolved basement room or shared stairway.',
            ],
            [
                'Fire Sanctuary F1 and B1',
                '`D201`, `D201_1`',
                'Confirm room 9 and record any other basement rooms.',
            ],
            [
                'Sandship 1F, B1, B2 and B3',
                '`D301`, escape `D301_1`',
                'Confirm assigned rooms and record B3 and escape rooms separately.',
            ],
            [
                'Volcano Summit / Bokoblin Base Summit',
                '`F201_1` room 0, layer 4; `F201_2`',
                'Verify the switch before and after the layer transition.',
            ],
            [
                'Upper and Lower Eldin Caves',
                '`F202_1` through `F202_4`',
                'Verify both cave pairs before and after Boko Base.',
            ],
        ],
    ),
    '## Maps without rules',
    '',
    table(
        ['Map', 'Next action'],
        missingRules.map((map) => [
            map.name,
            overviewMaps.has(map.id)
                ? 'Navigation overview; actual gameplay zones are assigned to detailed maps.'
                : 'Confirm stage/room/layer in game, or document why it cannot be distinguished.',
        ]),
    ),
    '### Known stage codes without any rule',
    '',
    table(
        ['Stage', 'Game area'],
        untrackedStages.map((stage) => [
            code(stage),
            gameAreas[stage] ?? 'Unknown',
        ]),
    ),
    '### Stage rules using a coarse fallback',
    '',
    'Keep these rules unless a more precise map and location discriminator have been verified.',
    '',
    table(
        ['Current fallback', 'Stage rule', 'Game area'],
        tracking
            .filter(
                ({ map, rule }) =>
                    overviewMaps.has(map.id) ||
                    (map.id === 'world' && rule.stage !== 'F020') ||
                    (map.id === 'skyloft' && rule.stage !== 'F000'),
            )
            .map(({ map, rule }) => [
                map.name,
                ruleDescription(rule),
                gameAreas[rule.stage] ?? 'Not in stage catalogue',
            ]),
    ),
    '## Complete inventories',
    '',
    '<details><summary>Logical exits and statue landings (no physical marker planned)</summary>',
    '',
    table([...exitColumns, 'Disposition'], tasks.logical),
    '</details>',
    '',
    '<details><summary>All map links, including fixed shortcuts</summary>',
    '',
    table(
        ['Source map', 'Marker (X, Y)', 'Fixed or vanilla map', 'Game exit'],
        links.map(({ map, marker }) => [
            map.name,
            `${marker.label} (${coordinates(marker)})`,
            mapsById.get(marker.targetMapId ?? '')?.name ?? 'Unassigned',
            marker.exitId
                ? `${graph.exits[marker.exitId]?.short_name ?? 'Unknown exit'} ${code(marker.exitId)}`
                : 'Fixed',
        ]),
    ),
    '</details>',
    '',
    '<details><summary>All assigned arrival IDs and destination maps</summary>',
    '',
    table(
        ['Arrival map', 'Arrival', 'Arrival ID'],
        [...arrivalOwners].map(([id, map]) => [
            map.name,
            graph.entrances[id]?.short_name ?? 'Unknown arrival',
            code(id),
        ]),
    ),
    '</details>',
    '',
    '<details><summary>All maps and current player-following rules</summary>',
    '',
    table(
        ['Map', 'Stage rules'],
        pack.maps.map((map) => [
            map.name,
            (map.trackingRules ?? []).map(ruleDescription).join('; ') || 'None',
        ]),
    ),
    '</details>',
    '',
].join('\n');

if (process.argv.includes('--check')) {
    if (
        !existsSync(reportPath) ||
        readFileSync(reportPath, 'utf8').replaceAll('\r\n', '\n') !== text
    ) {
        console.error(`Stale ${reportPath}. Run npm run audit:v2Pack.`);
        process.exitCode = 1;
    } else console.log('V2 pack association checklist is current.');
} else {
    writeFileSync(reportPath, text);
    console.log(`Updated ${reportPath}.`);
}
