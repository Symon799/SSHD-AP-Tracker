import type { CSSProperties } from 'react';
import { useSelector } from 'react-redux';
import swordBlock from '../assets/Sword_Block.png';
import { useDraggable } from '../dragAndDrop/DragAndDrop';
import { rawItemCountSelector } from '../tracker/Selectors';
// import { clickItem } from '../tracker/Slice';
import keyDownWrapper from '../utils/KeyDownWrapper';
import allImages from './Images';
import inGameStyles from './inGame/InGameInventoryOverlay.module.css';
import { InGameItemSlot } from './inGame/InGameItemSlot';
import Item from './Item';
import { ProgressiveItem } from './items/ProgressiveItem';

export default function SwordBlock({ width }: { width: number }) {
    // const dispatch = useDispatch();
    const handleExtraWalletClick = () => {
        // dispatch(clickItem({ item: 'Extra Wallet', take: false }));
    };

    const swordStyle: CSSProperties = {
        position: 'relative',
        bottom: width / 0.84,
        left: width / 2.85,
    };

    const faroresFlameStyle: CSSProperties = {
        position: 'relative',
        bottom: width / 1.07,
        left: width / 1.36,
    };

    const nayrusFlameStyle: CSSProperties = {
        position: 'relative',
        bottom: width / 1.12,
        left: width / 20,
    };

    const dinsFlameStyle: CSSProperties = {
        position: 'relative',
        bottom: width / 0.69,
        left: width / 2.55,
    };

    const walletStyle: CSSProperties = {
        position: 'relative',
        bottom: width / 2.46,
        left: width / 1.6,
    };

    const swordWidth = width / 3.1;
    const flameWidth = width / 4.4;
    const walletWidth = width / 3;

    const extraWalletCount = useSelector(rawItemCountSelector('Extra Wallet'));

    const { listeners, setNodeRef } = useDraggable({
        type: 'item',
        item: 'Extra Wallet',
    });

    return (
        <div>
            <img src={swordBlock} alt="" width={width} draggable={false} />
            <div style={swordStyle}>
                <ProgressiveItem
                    itemName="Progressive Sword"
                    imgWidth={swordWidth}
                />
            </div>
            <div style={faroresFlameStyle}>
                <Item
                    itemName="Progressive Sword"
                    images={allImages["Farore's Flame"]}
                    imgWidth={flameWidth}
                />
            </div>
            <div style={nayrusFlameStyle}>
                <Item
                    itemName="Progressive Sword"
                    images={allImages["Nayru's Flame"]}
                    imgWidth={flameWidth}
                />
            </div>
            <div style={dinsFlameStyle}>
                <Item
                    itemName="Progressive Sword"
                    images={allImages["Din's Flame"]}
                    imgWidth={flameWidth}
                />
            </div>
            <div style={walletStyle}>
                <InGameItemSlot
                    size={walletWidth}
                    className={inGameStyles.walletSlot}
                >
                    <ProgressiveItem
                        itemName="Progressive Wallet"
                        className={inGameStyles.scaledItem}
                        style={
                            {
                                '--item-image-scale': 0.8,
                            } as CSSProperties
                        }
                        imgWidth="100%"
                    />
                    <div
                        className={inGameStyles.walletExtraOverlay}
                        style={{ fontSize: walletWidth * 0.38 }}
                        onClick={handleExtraWalletClick}
                        onKeyDown={keyDownWrapper(handleExtraWalletClick)}
                        tabIndex={0}
                        role="button"
                        draggable
                        ref={setNodeRef}
                        {...listeners}
                    >
                        {`+${extraWalletCount * 300}`}
                    </div>
                </InGameItemSlot>
            </div>
        </div>
    );
}
