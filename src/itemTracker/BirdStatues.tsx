import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Dialog } from '../additionalComponents/Dialog';
import Tooltip from '../additionalComponents/Tooltip';
import statueIcon from '../assets/bird_statue.png';
import features from '../data/sshdWorldFeatures.json';
import { isItem, type InventoryItem } from '../logic/Inventory';
import type { RootState } from '../store/Store';
import { rawItemCountSelector, settingSelector } from '../tracker/Selectors';
import styles from './BirdStatues.module.css';
import Item from './Item';

function useStatueCount() {
    return useSelector((state: RootState) =>
        features.statues.reduce(
            (total, statue) =>
                total + Number((state.tracker.inventory[statue.item] ?? 0) > 0),
            0,
        ),
    );
}

function Statue({ item }: { item: InventoryItem }) {
    const count = useSelector(rawItemCountSelector(item));
    return (
        <div className={styles.statue} data-unlocked={count > 0}>
            <Item
                itemName={item}
                imgWidth={28}
                style={{ filter: count > 0 ? undefined : 'grayscale(1)' }}
            />
            <span>{item.replace(' Statue Unlock', '')}</span>
        </div>
    );
}

export function BirdStatues({ imgWidth }: { imgWidth: number }) {
    const enabled =
        useSelector(settingSelector('bird-statues-need-unlock')) === 'on';
    const [open, setOpen] = useState(false);
    const count = useStatueCount();
    if (!enabled) return null;
    return (
        <div className={styles.container}>
            <Tooltip
                content={`Bird Statues (${count}/${features.statues.length})`}
                delay={500}
            >
                <button
                    type="button"
                    className={styles.trigger}
                    style={{ height: imgWidth }}
                    aria-label={`Bird Statues ${count}/${features.statues.length}`}
                    onClick={() => setOpen(true)}
                >
                    <img src={statueIcon} alt="" />
                    <span className={styles.counter}>
                        {count}/{features.statues.length}
                    </span>
                </button>
            </Tooltip>
            <Dialog
                open={open}
                onOpenChange={setOpen}
                title="Bird Statue Unlocks"
                focusContentOnOpen
                wide
                className={styles.provinces}
            >
                {['Faron', 'Eldin', 'Lanayru'].map((province) => (
                    <section key={province}>
                        <h3>{province}</h3>
                        {features.statues
                            .filter((statue) => statue.world === province)
                            .map(
                                (statue) =>
                                    isItem(statue.item) && (
                                        <Statue
                                            key={statue.item}
                                            item={statue.item}
                                        />
                                    ),
                            )}
                    </section>
                ))}
            </Dialog>
        </div>
    );
}
