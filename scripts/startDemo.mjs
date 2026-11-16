import { spawn } from 'node:child_process';
import net from 'node:net';

async function freePort(start) {
    for (let port = start; port < start + 100; port++) {
        const available = await new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.listen(port, '127.0.0.1', () =>
                server.close(() => resolve(true)),
            );
        });
        if (available) return port;
    }
    throw new Error('No free demo port');
}

// A separate origin keeps demo saves away from the normal development tracker.
const appPort = await freePort(Number(process.env.DEMO_PORT ?? 5180));
const apPort = await freePort(Number(process.env.DEMO_AP_PORT ?? 38282));
const processes = [
    spawn(process.execPath, ['tests/e2e/mock-archipelago-server.mjs'], {
        stdio: 'inherit',
        env: { ...process.env, MOCK_AP_PORT: String(apPort) },
    }),
    spawn(
        process.execPath,
        [
            'node_modules/vite/bin/vite.js',
            '--host',
            '127.0.0.1',
            '--port',
            String(appPort),
            '--strictPort',
        ],
        { stdio: 'inherit' },
    ),
];
console.log(`Demo website: http://127.0.0.1:${appPort}/`);
if (process.env.DEMO_V2 === '1') {
    console.log(`V2 connection: http://127.0.0.1:${appPort}/v2/connect`);
    console.log(`V2 tracker: http://127.0.0.1:${appPort}/v2/`);
    console.log(`V2 editor: http://127.0.0.1:${appPort}/v2/editor`);
}
console.log(`AP server: localhost:${apPort}`);
console.log(
    'Slots: Vegetation Player (bundles + trees + signs), Blade Player (blades + trees + signs). No password.',
);
console.log(
    'Entrance Player: bundles + trees + signs, with manual dungeon and trial entrance randomization. No password.',
);
console.log(
    'Send !demo-check in Server & Tools to simulate another checked location.',
);
let stopping = false;
const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of processes) child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of processes) child.on('exit', stop);
