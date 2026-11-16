import yaml from 'js-yaml';
import fs from 'node:fs';
import { readSshdVegetation } from './generateSshdDump.mjs';

const [root, apworldPath, mode] = process.argv.slice(2);
if (!root || !apworldPath)
    throw new Error(
        'Usage: node scripts/generateSshdVegetation.mjs <rando-root> <Locations.py>',
    );
const dumpPath = 'testData/sshd-dump.yaml';
const optionsPath = 'testData/sshd-options.yaml';
const dump = yaml.load(fs.readFileSync(dumpPath, 'utf8'));
const options = yaml.load(fs.readFileSync(optionsPath, 'utf8'));
const additions = readSshdVegetation(root, apworldPath).filter(
    (entry) => mode !== '--signs-only' || entry.type === 'Signs, Custom Flag',
);
const areas = new Map();
const visit = (area) => {
    areas.set(area.name, area);
    Object.values(area.sub_areas).forEach(visit);
};
visit(dump.areas);
const items = new Set(dump.items);
for (const entry of additions) {
    dump.checks[entry.id] = {
        'original item': 'Green Rupee',
        type: entry.type,
        short_name: entry.name,
    };
    items.add(entry.id);
    for (const access of entry.accesses) {
        const area = areas.get(access.area);
        if (!area) throw new Error(`Missing tracker area: ${access.area}`);
        const key = entry.id.startsWith(`${area.name}\\`)
            ? entry.name
            : entry.id;
        area.locations[key] = access.requirement;
    }
}
for (const option of [
    {
        name: 'Sign Shuffle',
        command: 'sign-shuffle',
        type: 'singlechoice',
        choices: ['off', 'on'],
        bits: 1,
        default: 'off',
        help: 'Cut signs for randomized items.',
    },
    {
        name: 'Grass Shuffle',
        command: 'grass-shuffle',
        type: 'singlechoice',
        choices: ['off', 'bundles', 'blades'],
        bits: 2,
        default: 'off',
        help: 'One check per patch in bundles mode, or per blade in blades mode.',
    },
    {
        name: 'Small Tree Shuffle',
        command: 'tree-shuffle',
        type: 'singlechoice',
        choices: ['off', 'on'],
        bits: 1,
        default: 'off',
        help: 'Cut small trees and bamboo for randomized items.',
    },
]) {
    const index = options.findIndex(
        (candidate) => candidate.command === option.command,
    );
    if (index === -1) options.push(option);
    else options[index] = option;
}
dump.items = [...items];
fs.writeFileSync(dumpPath, yaml.dump(dump, { lineWidth: 100 }));
fs.writeFileSync(optionsPath, yaml.dump(options, { lineWidth: 100 }));
console.log(`Added/updated ${additions.length} vegetation checks`);
