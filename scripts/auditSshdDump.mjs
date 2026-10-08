import yaml from 'js-yaml';
import fs from 'node:fs';

const dumpPath = 'testData/sshd-dump.yaml';
const optionsPath = 'testData/sshd-options.yaml';

const dump = yaml.load(fs.readFileSync(dumpPath, 'utf8'));
const options = yaml.load(fs.readFileSync(optionsPath, 'utf8'));

if (!dump || typeof dump !== 'object' || !dump.checks || !dump.items) {
    throw new Error(`${dumpPath} is not a valid SSHD dump`);
}

if (!Array.isArray(options)) {
    throw new Error(`${optionsPath} is not a valid option list`);
}

const checks = Object.entries(dump.checks);
const itemIds = dump.items;
const itemSet = new Set(itemIds);
const sanityTypes = {
    'Pots, Custom Flag': 'pots',
    'Pumpkins, Custom Flag': 'pumpkins',
    'Barrels, Custom Flag': 'barrels',
};
const counts = { pots: 0, pumpkins: 0, barrels: 0 };
const missingFromItems = [];

for (const [id, check] of checks) {
    if (!itemSet.has(id)) missingFromItems.push(id);
    const countKey = sanityTypes[check?.type];
    if (countKey) counts[countKey]++;
}

const requiredOptions = ['pot-shuffle', 'pumpkin-shuffle', 'barrel-shuffle'];
const optionCommands = new Set(options.map((option) => option?.command));
const missingOptions = requiredOptions.filter(
    (command) => !optionCommands.has(command),
);

if (missingFromItems.length > 0) {
    throw new Error(
        `${missingFromItems.length} checks are missing from the dump item list`,
    );
}

if (missingOptions.length > 0) {
    throw new Error(
        `Missing SSHD option definitions: ${missingOptions.join(', ')}`,
    );
}

console.log(`SSHD dump audit passed: ${checks.length} checks`);
console.log(
    `Sanity checks: ${counts.pots} pots, ${counts.pumpkins} pumpkins, ${counts.barrels} barrels`,
);
console.log(`Option definitions: ${options.length}`);
