import type { CSSProperties } from 'react';
import miscItemBlock from '../assets/misc_items_block.png';
import Item from './Item';
import { InGameCounterItem } from './inGame/InGameCounterItem';
import inGameStyles from './inGame/InGameInventoryOverlay.module.css';
import { InGameItemLabel } from './inGame/InGameItemLabel';
import { InGameItemSlot } from './inGame/InGameItemSlot';

const MISC_BLOCK_HEIGHT_RATIO = 140 / 280;

function miscTop(width: number, bottomRatio: number): number {
    return width * (MISC_BLOCK_HEIGHT_RATIO - bottomRatio);
}

export default function AdditionalItems({ width }: { width: number }) {
    const pouchStyle: CSSProperties = {
        position: 'absolute',
        top: miscTop(width, 0.43),
        left: width * 0.08,
    };
    const bottleStyle: CSSProperties = {
        position: 'absolute',
        top: miscTop(width, 0.435),
        left: width * 0.31,
    };
    const chargeStyle: CSSProperties = {
        position: 'absolute',
        top: miscTop(width, 0.435),
        left: width * 0.54,
    };
    const tadtoneStyle: CSSProperties = {
        position: 'absolute',
        top: miscTop(width, 0.43),
        left: width * 0.785,
    };
    const keyStyle: CSSProperties = {
        position: 'absolute',
        top: miscTop(width, 0.22),
        left: width * 0.08,
    };
    const chartStyle: CSSProperties = {
        position: 'absolute',
        top: miscTop(width, 0.22),
        left: width * 0.35,
    };
    const fruitStyle: CSSProperties = {
        position: 'absolute',
        top: miscTop(width, 0.22),
        left: width * 0.542,
    };
    const scrapperStyle: CSSProperties = {
        position: 'absolute',
        top: miscTop(width, 0.22),
        left: width * 0.785,
    };

    const keyWidth = width / 6.5;
    const chartWidth = width / 10;
    const chargeWidth = width / 6.5;
    const pouchWidth = width / 6.5;
    const bottleWidth = width / 6.5;
    const fruitWidth = width / 6.5;
    const tadtoneWidth = width / 7;
    const scrapperWidth = width / 6.5;

    return (
        <div id="misc-items" style={{ display: 'flex' }}>
            <img src={miscItemBlock} alt="" width={width} draggable={false} />
            <div style={pouchStyle}>
                <InGameCounterItem
                    itemName="Progressive Pouch"
                    imgWidth={pouchWidth}
                />
            </div>
            <div style={bottleStyle}>
                <InGameCounterItem
                    itemName="Empty Bottle"
                    imgWidth={bottleWidth}
                    className={inGameStyles.scaledItem}
                    style={
                        {
                            '--item-image-scale': 0.72,
                        } as CSSProperties
                    }
                    counterClassName={inGameStyles.bottleCounter}
                />
            </div>
            <div style={chargeStyle}>
                <InGameItemSlot size={chargeWidth}>
                    <Item itemName="Spiral Charge" imgWidth="100%" />
                </InGameItemSlot>
            </div>
            <div style={tadtoneStyle}>
                <InGameCounterItem
                    itemName="Group of Tadtones"
                    imgWidth={tadtoneWidth}
                />
            </div>
            <div style={keyStyle}>
                <InGameItemSlot
                    size={keyWidth}
                    className={inGameStyles.labelSlot}
                >
                    <Item itemName="Lanayru Caves Small Key" imgWidth="100%" />
                    <InGameItemLabel>Caves</InGameItemLabel>
                </InGameItemSlot>
            </div>
            <div style={chartStyle}>
                <InGameItemSlot size={chartWidth}>
                    <Item itemName="Sea Chart" imgWidth="100%" />
                </InGameItemSlot>
            </div>
            <div style={fruitStyle}>
                <InGameItemSlot size={fruitWidth}>
                    <Item itemName="Life Tree Fruit" imgWidth="100%" />
                </InGameItemSlot>
            </div>
            <div style={scrapperStyle}>
                <InGameItemSlot size={scrapperWidth}>
                    <Item itemName="Scrapper" imgWidth="100%" />
                </InGameItemSlot>
            </div>
        </div>
    );
}
