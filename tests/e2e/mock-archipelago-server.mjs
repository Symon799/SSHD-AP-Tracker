import http from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.MOCK_AP_PORT ?? 38281);
const game = 'Skyward Sword HD';
const checkedLocationId = 1001;
const secondLocationId = 1002;
const thirdLocationId = 1003;
const progressiveSwordId = 2001;
const statueUnlockId = 2002;
const progressiveLoftwingId = 2003;
const featureLocationIds = [1004, 1005, 1006, 1007];
const loftwingScenarios = {
    'Loftwing Player': { start: 0, received: 1 },
    'Spiral Charge Player': { start: 0, received: 2 },
    'Starting Loftwing Player': { start: 1, received: 1 },
    'Starting Spiral Charge Player': { start: 1, received: 2 },
};

const gamePackage = {
    checksum: 'sshd-e2e-fixture-v3',
    item_name_to_id: {
        'Progressive Sword': progressiveSwordId,
        'Sealed Grounds Statue Unlock': statueUnlockId,
        'Progressive Loftwing': progressiveLoftwingId,
    },
    location_name_to_id: {
        "Knight Academy - Fledge's Gift": checkedLocationId,
        'Knight Academy - Item from Cawlin': secondLocationId,
        'Upper Skyloft - Ring Knight Academy Bell': thirdLocationId,
        'Sealed Grounds - Sealed Grounds Bird Statue': 1004,
        'Deep Woods - Deep Woods Bird Statue': 1005,
        'Deep Woods - Goddess Cube Near Goron': 1006,
        'Lumpy Pumpkin - Goddess Chest near Gossip Stone': 1007,
    },
};

const roomInfo = {
    cmd: 'RoomInfo',
    version: { class: 'Version', major: 0, minor: 6, build: 0 },
    generator_version: { class: 'Version', major: 0, minor: 6, build: 0 },
    tags: ['AP'],
    password: false,
    permissions: { release: 0, collect: 0, remaining: 0, hint: 0 },
    hint_cost: 0,
    location_check_points: 1,
    games: [game],
    datapackage_checksums: { [game]: gamePackage.checksum },
    seed_name: 'SSHD-E2E-SEED',
    time: Math.floor(Date.now() / 1000),
};

const slotData = {
    location_to_item_map: {
        [checkedLocationId]: progressiveSwordId,
        [secondLocationId]: progressiveSwordId,
        [thirdLocationId]: progressiveSwordId,
    },
    option_empty_unrequired_dungeons: 0,
    option_required_dungeon_count: 0,
    option_triforce_required: 0,
};

const send = (socket, ...packets) => {
    socket.send(JSON.stringify(packets));
};

const server = http.createServer((request, response) => {
    if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
        return;
    }

    response.writeHead(404);
    response.end();
});

const webSocketServer = new WebSocketServer({ server });

webSocketServer.on('connection', (socket) => {
    let featureMode = false;
    let loftwingMode;
    let authenticated = false;
    let itemsSent = false;
    send(socket, roomInfo);

    socket.on('message', (rawMessage) => {
        const packets = JSON.parse(rawMessage.toString());

        for (const packet of packets) {
            if (packet.cmd === 'Connect') {
                featureMode = packet.name === 'Feature Player';
                loftwingMode = loftwingScenarios[packet.name];
                authenticated = true;
                send(socket, {
                    cmd: 'Connected',
                    team: 0,
                    slot: 1,
                    players: [
                        {
                            team: 0,
                            slot: 1,
                            alias: packet.name,
                            name: packet.name,
                        },
                        {
                            team: 0,
                            slot: 2,
                            alias: 'Fixture Friend',
                            name: 'Fixture Friend',
                        },
                    ],
                    missing_locations: [
                        secondLocationId,
                        thirdLocationId,
                        ...(featureMode ? featureLocationIds : []),
                    ],
                    checked_locations: [checkedLocationId],
                    slot_data: featureMode
                        ? {
                              ...slotData,
                              option_bird_statues_give_items: 1,
                              option_bird_statues_need_unlock: 1,
                              option_decouple_goddess_cubes_and_chests: 1,
                              option_goddess_chest_unlock: 2,
                              option_custom_starting_items: {
                                  'Deep Woods Statue Unlock': 1,
                              },
                              location_to_item_map: {
                                  ...slotData.location_to_item_map,
                                  ...Object.fromEntries(
                                      featureLocationIds.map((id) => [
                                          id,
                                          progressiveSwordId,
                                      ]),
                                  ),
                              },
                          }
                        : loftwingMode
                          ? {
                                ...slotData,
                                option_randomize_loftwing: loftwingMode.start,
                                option_custom_starting_items: loftwingMode.start
                                    ? { 'Progressive Loftwing': 1 }
                                    : {},
                            }
                          : slotData,
                    slot_info: {
                        1: {
                            name: packet.name,
                            game,
                            type: 1,
                            group_members: [],
                        },
                        2: {
                            name: 'Fixture Friend',
                            game,
                            type: 1,
                            group_members: [],
                        },
                    },
                    hint_points: 0,
                });
            } else if (packet.cmd === 'GetDataPackage') {
                send(socket, {
                    cmd: 'DataPackage',
                    data: { games: { [game]: gamePackage } },
                });
                // The library may request the package before authentication.
                // Real AP servers only deliver inventory after Connected.
                if (!authenticated || itemsSent) continue;
                itemsSent = true;
                send(socket, {
                    cmd: 'ReceivedItems',
                    index: 0,
                    items: [
                        ...Array.from(
                            { length: loftwingMode?.received ?? 0 },
                            (_, index) => ({
                                item: progressiveLoftwingId,
                                location:
                                    loftwingMode.start && index === 0
                                        ? -2
                                        : 3100 + index,
                                player:
                                    loftwingMode.start && index === 0 ? 0 : 2,
                                flags: 1,
                            }),
                        ),
                        ...(featureMode
                            ? [
                                  {
                                      item: statueUnlockId,
                                      location: 3001,
                                      player: 2,
                                      flags: 1,
                                  },
                              ]
                            : []),
                        {
                            item: progressiveSwordId,
                            location: secondLocationId,
                            player: 2,
                            flags: 1,
                        },
                    ],
                });
            } else if (packet.cmd === 'Get') {
                send(socket, { cmd: 'Retrieved', keys: {} });
            } else if (packet.cmd === 'LocationScouts') {
                send(socket, {
                    cmd: 'LocationInfo',
                    locations: [],
                });
            }
        }
    });
});

server.listen(port, '127.0.0.1', () => {
    console.log(`Mock Archipelago server listening on 127.0.0.1:${port}`);
});

const shutdown = () => {
    webSocketServer.close();
    server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
