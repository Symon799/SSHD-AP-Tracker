import wheel from '../assets/b wheel.png';
import Item from './Item';
import { ProgressiveItem } from './items/ProgressiveItem';

export default function BWheel({ width }: { width: number }) {
    const beetleWidth = width / 5.2;
    const slingshotWidth = width / 6.5;
    const bombsWidth = width / 6.5;
    const bugNetWidth = width / 6.5;
    const bowWidth = width / 5.5;
    const clawshotsWidth = width / 4.6;
    const whipWidth = width / 5.5;
    const bellowsWidth = width / 5.2;

    return (
        <div>
            <img src={wheel} alt="" width={width} draggable={false} />
            <div
                style={{
                    position: 'relative',
                    bottom: width / 1.75,
                    left: width / 1.33,
                }}
            >
                <ProgressiveItem
                    itemName="Progressive Beetle"
                    imgWidth={beetleWidth}
                />
            </div>
            <div
                style={{
                    position: 'relative',
                    bottom: width / 3.85,
                    left: width / 2.3,
                }}
            >
                <ProgressiveItem
                    itemName="Progressive Slingshot"
                    imgWidth={slingshotWidth}
                />
            </div>
            <div
                style={{
                    position: 'relative',
                    bottom: width / 1.22,
                    left: width / 1.51,
                }}
            >
                <Item itemName="Bomb Bag" imgWidth={bombsWidth} />
            </div>
            <div
                style={{
                    position: 'relative',
                    bottom: width / 2.9,
                    left: width / 1.51,
                }}
            >
                <ProgressiveItem
                    itemName="Progressive Bug Net"
                    imgWidth={bugNetWidth}
                />
            </div>
            <div
                style={{
                    position: 'relative',
                    bottom: width / 1.09,
                    left: width / 2.4,
                }}
            >
                <ProgressiveItem
                    itemName="Progressive Bow"
                    imgWidth={bowWidth}
                />
            </div>
            <div
                style={{
                    position: 'relative',
                    bottom: width / 2.9,
                    left: width / 6.8,
                }}
            >
                <Item itemName="Clawshots" imgWidth={clawshotsWidth} />
            </div>
            <div
                style={{
                    position: 'relative',
                    bottom: width / 1.75,
                    left: width / 13,
                }}
            >
                <Item itemName="Whip" imgWidth={whipWidth} />
            </div>
            <div
                style={{
                    position: 'relative',
                    bottom: width / 1.22,
                    left: width / 6,
                }}
            >
                <Item itemName="Gust Bellows" imgWidth={bellowsWidth} />
            </div>
        </div>
    );
}
