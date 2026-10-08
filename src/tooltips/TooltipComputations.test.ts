import {
    trickSemiLogicSelector,
    trickSemiLogicTrickListSelector,
} from '../customization/Selectors';
import {
    setEnabledSemilogicTricks,
    setTrickSemiLogic,
} from '../customization/Slice';
import { mergeRequirements } from '../logic/bitlogic/BitLogic';
import type BooleanExpression from '../logic/booleanlogic/BooleanExpression';
import { logicSelector, optionsSelector } from '../logic/Selectors';
import { createTestLogic } from '../testing/TestingUtils';
import {
    allSettingsSelector,
    areasSelector,
    getRequirementLogicalStateSelector,
    settingsRequirementsSelector,
    settingsSelector,
} from '../tracker/Selectors';
import { acceptSettings } from '../tracker/Slice';
import { TooltipComputer } from './TooltipComputations';
import {
    booleanExprToTooltipExpr,
    type RootTooltipExpression,
    type TooltipExpression,
} from './TooltipExpression';

describe('tooltips', () => {
    const tester = createTestLogic();

    beforeAll(tester.initialize);

    function createComputer(): TooltipComputer {
        const logic = tester.readSelector(logicSelector);
        const options = tester.readSelector(optionsSelector);
        const settings = tester.readSelector(settingsSelector);
        const settingsRequirements = tester.readSelector(
            settingsRequirementsSelector,
        );
        const expertMode = tester.readSelector(trickSemiLogicSelector);
        const consideredTricks = tester.readSelector(
            trickSemiLogicTrickListSelector,
        );

        const bitLogic = mergeRequirements(
            logic.numRequirements,
            logic.staticRequirements,
            settingsRequirements,
        );
        return new TooltipComputer(
            logic,
            options,
            settings,
            expertMode,
            consideredTricks,
            bitLogic,
        );
    }

    async function getTooltipExpression(
        computer: TooltipComputer,
        checkId: string,
    ): Promise<RootTooltipExpression> {
        let expr: BooleanExpression | undefined;
        expr = computer.getSnapshot(checkId);
        if (!expr) {
            let doResolve: (() => void) | undefined;
            const callback = () => {
                doResolve!();
            };
            let resultPromise = new Promise<void>((resolve) => {
                doResolve = resolve;
            });
            const unsubscribe = computer.subscribe(checkId, callback);
            expr = computer.getSnapshot(checkId);
            while (!expr) {
                // Results aren't available, so we need to await.
                await resultPromise;
                expr = computer.getSnapshot(checkId);
                if (expr) {
                    break;
                }
                resultPromise = new Promise<void>((resolve) => {
                    doResolve = resolve;
                });
            }
            unsubscribe();
            expect(expr).toBeDefined();
        }

        return booleanExprToTooltipExpr(
            tester.readSelector(logicSelector),
            expr,
            tester.readSelector(getRequirementLogicalStateSelector),
        );
    }

    function formatExpr(expr: TooltipExpression): string {
        if (expr.type === 'item') {
            return expr.item;
        } else {
            return `(${expr.items.map(formatExpr).join(` ${expr.op} `)})`;
        }
    }

    function findCheckIdAnywhere(checkName: string) {
        const area = tester
            .readSelector(areasSelector)
            .find((candidate) =>
                [
                    ...candidate.checks.list,
                    ...(candidate.extraLocations.loose_crystal?.list ?? []),
                    ...(candidate.extraLocations.tr_cube?.list ?? []),
                    ...(candidate.extraLocations.gossip_stone?.list ?? []),
                ].some((checkId) => checkId.includes(checkName)),
            );
        expect(area).toBeDefined();
        return tester.findCheckId(area!.name, checkName);
    }

    describe('basic checks', () => {
        let computer: TooltipComputer;
        beforeAll(() => {
            tester.reset();

            const settings = tester.readSelector(allSettingsSelector);
            tester.dispatch(
                acceptSettings({
                    settings: { ...settings, 'excluded-locations': [] },
                }),
            );
            computer = createComputer();
        });

        it.concurrent('computes Nothing', async ({ expect }) => {
            const result = await getTooltipExpression(
                computer,
                tester.findCheckId('Upper Skyloft', "Fledge's Gift"),
            );
            expect(formatExpr(result)).toMatchInlineSnapshot(`"(Nothing)"`);
        });

        it.concurrent('computes Batreaux', async ({ expect }) => {
            const result = await getTooltipExpression(
                computer,
                tester.findCheckId("Batreaux's House", '30 Crystals Chest'),
            );
            expect(formatExpr(result)).toMatchInlineSnapshot(
                `"(30 Gratitude Crystals)"`,
            );
        });

        it.concurrent(
            'computes Skyloft interior requirements without unknown entrances',
            async ({ expect }) => {
                const gondo = await getTooltipExpression(
                    computer,
                    findCheckIdAnywhere("Repair Gondo's Junk"),
                );
                const parrow = await getTooltipExpression(
                    computer,
                    findCheckIdAnywhere("Parrow's Gift"),
                );
                const beedle300 = await getTooltipExpression(
                    computer,
                    findCheckIdAnywhere('300 Rupee Item'),
                );
                const beedleThird100 = await getTooltipExpression(
                    computer,
                    findCheckIdAnywhere('Third 100 Rupee Item'),
                );

                expect(formatExpr(gondo)).not.toContain(
                    'Impossible (discover an entrance first)',
                );
                expect(formatExpr(parrow)).not.toContain(
                    'Impossible (discover an entrance first)',
                );
                expect(formatExpr(beedle300)).not.toContain(
                    'Impossible (discover an entrance first)',
                );
                expect(formatExpr(beedleThird100)).not.toContain(
                    'Impossible (discover an entrance first)',
                );
            },
        );

        it.concurrent(
            'computes more complicated things',
            async ({ expect }) => {
                const result = await getTooltipExpression(
                    computer,
                    tester.findCheckId('Lanayru Desert', 'Rescue Caged Robot'),
                );
                expect(formatExpr(result)).toMatchInlineSnapshot(
                    `"(Amber Tablet and (Bomb Bag or (Hook Beetle and (Bow or Practice Sword))))"`,
                );
            },
        );

        it.concurrent('computes goddess chest', async ({ expect }) => {
            const result = await getTooltipExpression(
                computer,
                tester.findCheckId(
                    'Sky',
                    "Cage\\Beedle's Island Cage Goddess Chest",
                ),
            );
            expect(formatExpr(result)).toMatchInlineSnapshot(
                `"(Clawshots and Emerald Tablet and Goddess Sword)"`,
            );
        });

        it.concurrent(
            'correctly factors out combinations',
            async ({ expect }) => {
                const result = await getTooltipExpression(
                    computer,
                    tester.findCheckId('Faron Woods', 'Deep Woods Chest'),
                );
                expect(formatExpr(result)).toMatchInlineSnapshot(
                    `"(Emerald Tablet and (Clawshots or ((Bomb Bag or Practice Sword) and (Beetle or Bow or Slingshot))))"`,
                );
            },
        );

        it.concurrent('shows no tricks by default', async ({ expect }) => {
            const result = await getTooltipExpression(
                computer,
                tester.findCheckId('Eldin Volcano', 'Digging Spot below Tower'),
            );
            expect(formatExpr(result)).toMatchInlineSnapshot(
                `"(Digging Mitts and Ruby Tablet and (Bow or Slingshot))"`,
            );
        });
    });

    describe('trick logic', () => {
        let computer: TooltipComputer;
        beforeAll(() => {
            tester.reset();

            const settings = tester.readSelector(allSettingsSelector);
            tester.dispatch(
                acceptSettings({
                    settings: { ...settings, 'excluded-locations': [] },
                }),
            );
            tester.dispatch(setTrickSemiLogic(true));
            tester.dispatch(setEnabledSemilogicTricks(['Stuttersprint']));
            computer = createComputer();
        });

        it.concurrent('shows tricks if asked', async ({ expect }) => {
            const result = await getTooltipExpression(
                computer,
                tester.findCheckId('Eldin Volcano', 'Digging Spot below Tower'),
            );
            expect(formatExpr(result)).toMatchInlineSnapshot(
                `"(Digging Mitts and Ruby Tablet and (Bow or Slingshot or Stuttersprint Trick))"`,
            );
        });
    });
});
