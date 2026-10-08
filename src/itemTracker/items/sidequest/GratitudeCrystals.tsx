import clsx from 'clsx';
import { useSelector } from 'react-redux';
import { totalGratitudeCrystalsSelector } from '../../../tracker/Selectors';
import { BasicItem } from '../../BasicItem';
import allImages from '../../Images';
import inGameStyles from '../../inGame/InGameInventoryOverlay.module.css';
import { InGameItemSlot } from '../../inGame/InGameItemSlot';
import counterStyles from '../CounterItem.module.css';
import { ItemCounterOverlay } from '../ItemCounterOverlay';

export function GratitudeCrystals({
    className,
    imgWidth,
    grid,
}: {
    className?: string;
    imgWidth?: number;
    grid?: boolean;
}) {
    const handleClick = () => {
        // dispatch(clickItem({ item: 'Gratitude Crystal Pack', take }));
    };

    const count = useSelector(totalGratitudeCrystalsSelector);

    const itemImages =
        allImages[grid ? 'Gratitude Crystals Grid' : 'Gratitude Crystals'];

    if (grid) {
        return (
            <BasicItem
                className={clsx(className, counterStyles.counterItemContainer)}
                itemName="Gratitude Crystals"
                images={itemImages}
                count={count > 0 ? 1 : 0}
                imgWidth={imgWidth}
                onGiveOrTake={handleClick}
                dragItemName="Gratitude Crystal Pack"
            >
                <ItemCounterOverlay count={count} hideWhenZero={false} />
            </BasicItem>
        );
    }

    return (
        <InGameItemSlot size={imgWidth ?? 0}>
            <BasicItem
                className={clsx(className, inGameStyles.counterItemContainer)}
                itemName="Gratitude Crystals"
                images={itemImages}
                count={count > 0 ? 1 : 0}
                imgWidth="100%"
                onGiveOrTake={handleClick}
                dragItemName="Gratitude Crystal Pack"
            >
                <ItemCounterOverlay
                    count={count}
                    hideWhenZero={false}
                    className={inGameStyles.counter}
                />
            </BasicItem>
        </InGameItemSlot>
    );
}
