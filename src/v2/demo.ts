import faronImage from '../assets/maps/Faron.png';
import skyloftImage from '../assets/maps/Skyloft.png';
import type { Logic } from '../logic/Logic';
import type { MapDocument } from './pack';

export function demoDocument(logic: Logic): MapDocument {
    const find = (name: string) =>
        Object.entries(logic.checks).find(
            ([, check]) => check.name === name,
        )?.[0];
    const named = (names: string[]) =>
        names.flatMap((name) => find(name) ?? []);
    const patch = Object.entries(logic.checks)
        .filter(([, check]) =>
            /^Central Skyloft - Grass Patch 1(?: - Blade \d+)?$/.test(
                check.name,
            ),
        )
        .map(([id]) => id);
    return {
        images: {
            'images/skyloft.png': skyloftImage,
            'images/faron.png': faronImage,
        },
        pack: {
            version: 1,
            id: 'sshd-v2-demo',
            name: 'SSHD V2 · Working Pack',
            maps: [
                {
                    id: 'skyloft',
                    name: 'Skyloft',
                    image: 'images/skyloft.png',
                    width: 843,
                    height: 465,
                    entranceIds: [],
                    markers: [
                        {
                            id: 'waterfall',
                            kind: 'checks',
                            label: 'Waterfall Cave',
                            x: 640,
                            y: 185,
                            checkIds: named([
                                'Central Skyloft - Waterfall Cave First Chest',
                                'Central Skyloft - Waterfall Cave Second Chest',
                            ]),
                            note: 'Two chests inside Waterfall Cave. Demo placements are approximate.',
                        },
                        {
                            id: 'parrow',
                            kind: 'checks',
                            label: "Parrow's Gift",
                            x: 570,
                            y: 320,
                            checkIds: named([
                                "Central Skyloft - Parrow's Gift",
                            ]),
                        },
                        {
                            id: 'grass',
                            kind: 'checks',
                            label: 'Grass Patch 1',
                            x: 530,
                            y: 390,
                            checkIds: patch,
                        },
                        {
                            id: 'faron-link',
                            kind: 'link',
                            label: 'Faron Province',
                            x: 780,
                            y: 430,
                            targetMapId: 'faron',
                        },
                    ],
                },
                {
                    id: 'faron',
                    name: 'Faron Province',
                    image: 'images/faron.png',
                    width: 843,
                    height: 465,
                    entranceIds: [],
                    markers: [
                        {
                            id: 'kikwi',
                            kind: 'checks',
                            label: "Kikwi Elder's Reward",
                            x: 480,
                            y: 300,
                            checkIds: named([
                                "Faron Woods - Kikwi Elder's Reward",
                            ]),
                        },
                        {
                            id: 'woods',
                            kind: 'checks',
                            label: 'Faron Woods',
                            x: 530,
                            y: 340,
                            checkIds: named([
                                'Faron Woods - Chest behind Upper Bombable Rock',
                                'Faron Woods - Item behind Lower Bombable Rock',
                            ]),
                        },
                        {
                            id: 'skyloft-link',
                            kind: 'link',
                            label: 'Skyloft',
                            x: 180,
                            y: 100,
                            targetMapId: 'skyloft',
                        },
                    ],
                },
            ],
        },
    };
}
