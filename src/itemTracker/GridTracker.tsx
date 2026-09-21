import type { CSSProperties } from 'react';
import { useSelector } from 'react-redux';
import noTablets from '../assets/tablets/no_tablets.png';
import { useDraggable } from '../dragAndDrop/DragAndDrop';
import { rawItemCountSelector } from '../tracker/Selectors';
// import { clickItem } from '../tracker/Slice';
import styles from './GridTracker.module.css';
import Item from './Item';
import { CounterItem } from './items/CounterItem';
import counterStyles from './items/CounterItem.module.css';
import { ProgressiveItem } from './items/ProgressiveItem';
import { GratitudeCrystals } from './items/sidequest/GratitudeCrystals';

export const GRID_TRACKER_ASPECT_RATIO = 1.063;

export default function GridTracker({ width }: { width: number }) {
    // const dispatch = useDispatch();
    const handleExtraWalletClick = () => {
        // dispatch(clickItem({ item: 'Extra Wallet', take: false }));
    };

    const emeraldTabletStyle: CSSProperties = {
        position: 'absolute',
        left: '100%',
        bottom: '0%',
        transform: 'translate(-100%)',
    };

    const rubyTabletStyle: CSSProperties = {
        position: 'absolute',
        left: '100%',
        top: '0%',
        transform: 'translate(-100%)',
    };

    const amberTabletStyle: CSSProperties = {
        position: 'absolute',
        left: '0%',
        top: '0%',
    };

    const imgWidth = width / 8.1;

    const emptyTabWidth = imgWidth * 2.5;
    const emeraldWidth = emptyTabWidth * 0.54;
    const rubyWidth = emptyTabWidth * 0.74;
    const amberWidth = emptyTabWidth * 0.505;

    const walletCount = useSelector(rawItemCountSelector('Extra Wallet')) ?? 0;

    const { listeners, setNodeRef } = useDraggable({
        type: 'item',
        item: 'Extra Wallet',
    });

    return (
        <div
            className={styles.itemGrid}
            style={
                {
                    '--grid-item-size': `${imgWidth}px`,
                    '--grid-item-tall-size': `${imgWidth * 2 + 2}px`,
                } as CSSProperties
            }
        >
            <div className={styles.swordCell} style={{ gridRow: '1 / span 2' }}>
                <ProgressiveItem
                    itemName="Progressive Sword"
                    imgWidth={imgWidth}
                />
            </div>
            <div>
                <ProgressiveItem
                    itemName="Progressive Beetle"
                    imgWidth={imgWidth}
                />
            </div>
            <div>
                <ProgressiveItem
                    itemName="Progressive Slingshot"
                    imgWidth={imgWidth}
                />
            </div>
            <div>
                <Item itemName="Bomb Bag" imgWidth={imgWidth} />
            </div>
            <div>
                <ProgressiveItem
                    itemName="Progressive Bug Net"
                    imgWidth={imgWidth}
                />
            </div>
            <div
                className={styles.tabletBlock}
                style={{
                    position: 'relative',
                    gridRow: '1 / span 2',
                    gridColumn: '6 / span 2',
                }}
            >
                <img
                    src={noTablets}
                    alt=""
                    width={emptyTabWidth}
                    draggable={false}
                />
                <div style={amberTabletStyle}>
                    <Item imgWidth={amberWidth} itemName="Amber Tablet" />
                </div>
                <div style={emeraldTabletStyle}>
                    <Item imgWidth={emeraldWidth} itemName="Emerald Tablet" />
                </div>
                <div style={rubyTabletStyle}>
                    <Item imgWidth={rubyWidth} itemName="Ruby Tablet" />
                </div>
            </div>
            <div>
                <ProgressiveItem
                    itemName="Progressive Bow"
                    imgWidth={imgWidth}
                />
            </div>
            <div>
                <Item itemName="Clawshots" imgWidth={imgWidth} />
            </div>
            <div>
                <Item itemName="Whip" imgWidth={imgWidth} />
            </div>
            <div>
                <Item itemName="Gust Bellows" imgWidth={imgWidth} />
            </div>
            <div>
                <Item
                    itemName="Lanayru Caves Small Key"
                    imgWidth={imgWidth}
                    className={styles.cavesKey}
                >
                    <div className={styles.cavesKeyLabel}>Caves</div>
                </Item>
            </div>
            <div>
                <Item itemName="Sea Chart" imgWidth={imgWidth} />
            </div>
            <div>
                <Item itemName="Spiral Charge" imgWidth={imgWidth} />
            </div>
            <div>
                <Item itemName="Sailcloth" imgWidth={imgWidth} grid />
            </div>
            <div>
                <Item itemName="Loftwing" imgWidth={imgWidth} grid />
            </div>
            <div>
                <CounterItem itemName="Progressive Pouch" imgWidth={imgWidth} />
            </div>
            <div>
                <CounterItem itemName="Empty Bottle" imgWidth={imgWidth} />
            </div>
            <div style={{ position: 'relative' }}>
                <div
                    className={counterStyles.overlayText}
                    style={{
                        position: 'absolute',
                        left: 0,
                        width: '100%',
                        textAlign: 'right',
                        bottom: '10%',
                        fontSize: imgWidth * 0.4,
                    }}
                    onClick={handleExtraWalletClick}
                    onKeyDown={handleExtraWalletClick}
                    tabIndex={0}
                    draggable
                    ref={setNodeRef}
                    role="button"
                    {...listeners}
                >
                    {`+${walletCount * 300}`}
                </div>
                <div>
                    <ProgressiveItem
                        itemName="Progressive Wallet"
                        imgWidth={imgWidth}
                    />
                </div>
            </div>
            <div>
                <ProgressiveItem
                    itemName="Progressive Mitts"
                    imgWidth={imgWidth}
                    grid
                />
            </div>
            <div>
                <Item itemName="Goddess's Harp" imgWidth={imgWidth} grid />
            </div>
            <div>
                <Item
                    itemName="Ballad of the Goddess"
                    imgWidth={imgWidth}
                    grid
                />
            </div>
            <div>
                <Item itemName="Farore's Courage" imgWidth={imgWidth} grid />
            </div>
            <div>
                <Item itemName="Nayru's Wisdom" imgWidth={imgWidth} grid />
            </div>
            <div>
                <Item itemName="Din's Power" imgWidth={imgWidth} grid />
            </div>
            <div
                style={{
                    position: 'relative',
                }}
            >
                <CounterItem
                    itemName="Song of the Hero"
                    imgWidth={imgWidth}
                    grid
                />
            </div>
            <div>
                <Item itemName="Triforce" imgWidth={imgWidth} grid />
            </div>
            <div>
                <Item
                    itemName="Water Dragon's Scale"
                    imgWidth={imgWidth}
                    grid
                />
            </div>
            <div>
                <Item itemName="Fireshield Earrings" imgWidth={imgWidth} grid />
            </div>
            <div>
                <Item itemName="Cawlin's Letter" imgWidth={imgWidth} grid />
            </div>
            <div>
                <Item
                    itemName="Horned Colossus Beetle"
                    imgWidth={imgWidth}
                    grid
                />
            </div>
            <div>
                <Item itemName="Baby Rattle" imgWidth={imgWidth} grid />
            </div>
            <div>
                <GratitudeCrystals imgWidth={imgWidth} grid />
            </div>
            <div>
                <Item itemName="Life Tree Fruit" imgWidth={imgWidth} />
            </div>
            <div>
                <CounterItem itemName="Group of Tadtones" imgWidth={imgWidth} />
            </div>
            <div>
                <Item itemName="Scrapper" imgWidth={imgWidth} />
            </div>
        </div>
    );
}
