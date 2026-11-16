import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from 'react';
import { useElementSize } from '../utils/React';
import styles from './v2.module.css';

function storedNumber(key: string, fallback: number) {
    try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
        return fallback;
    }
}

function usePanelSize(key: string, fallback: number) {
    const [value, setValue] = useState(() => storedNumber(key, fallback));
    useEffect(() => {
        try {
            localStorage.setItem(key, String(value));
        } catch {
            /* Layout storage is optional. */
        }
    }, [key, value]);
    return [value, setValue] as const;
}

function Divider({
    label,
    horizontal = false,
    reverse = false,
    value,
    min,
    max,
    change,
}: {
    label: string;
    horizontal?: boolean;
    reverse?: boolean;
    value: number;
    min: number;
    max: number;
    change: (value: number) => void;
}) {
    const drag = useRef<{ pointer: number; value: number } | undefined>(
        undefined,
    );
    const constrain = (next: number) =>
        change(Math.max(min, Math.min(max, next)));
    return (
        <button
            type="button"
            className={`${styles.panelDivider} ${horizontal ? styles.horizontalDivider : ''}`}
            role="separator"
            aria-label={label}
            aria-orientation={horizontal ? 'horizontal' : 'vertical'}
            aria-valuenow={Math.round(value)}
            aria-valuemin={min}
            aria-valuemax={Math.round(max)}
            onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                    pointer: horizontal ? event.clientY : event.clientX,
                    value,
                };
            }}
            onPointerMove={(event) => {
                if (drag.current)
                    constrain(
                        drag.current.value +
                            ((horizontal ? event.clientY : event.clientX) -
                                drag.current.pointer) *
                                (reverse ? -1 : 1),
                    );
            }}
            onPointerUp={() => {
                drag.current = undefined;
            }}
            onPointerCancel={() => {
                drag.current = undefined;
            }}
            onKeyDown={(event) => {
                const step = horizontal
                    ? event.key === 'ArrowUp'
                        ? -12
                        : event.key === 'ArrowDown'
                          ? 12
                          : 0
                    : event.key === 'ArrowLeft'
                      ? -12
                      : event.key === 'ArrowRight'
                        ? 12
                        : 0;
                if (step) {
                    event.preventDefault();
                    constrain(value + step * (reverse ? -1 : 1));
                }
            }}
        >
            <span />
        </button>
    );
}

export function ResizableWorkspace({
    left,
    right,
    children,
    storageKey,
}: {
    left: ReactNode;
    right?: ReactNode;
    children: ReactNode;
    storageKey: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { measuredWidth } = useElementSize(ref);
    const [leftWidth, setLeftWidth] = usePanelSize(
        `sshd-v2:${storageKey}:left`,
        280,
    );
    const [rightWidth, setRightWidth] = usePanelSize(
        `sshd-v2:${storageKey}:right`,
        330,
    );
    const width = measuredWidth || window.innerWidth;
    const maxLeft = Math.max(
        190,
        Math.min(560, width - (right ? Math.min(rightWidth, 400) : 0) - 260),
    );
    const leftSize = Math.max(190, Math.min(maxLeft, leftWidth));
    const maxRight = Math.max(240, Math.min(620, width - leftSize - 260));
    const rightSize = Math.max(240, Math.min(maxRight, rightWidth));
    const style: CSSProperties = {
        gridTemplateColumns: `${leftSize}px 7px minmax(180px, 1fr)${right ? ` 7px ${rightSize}px` : ''}`,
    };
    return (
        <div
            ref={ref}
            className={`${styles.body} ${styles.resizableBody}`}
            style={style}
        >
            {left}
            <Divider
                label="Resize left panel"
                value={leftSize}
                min={190}
                max={maxLeft}
                change={setLeftWidth}
            />
            {children}
            {Boolean(right) && (
                <>
                    <Divider
                        label="Resize right panel"
                        reverse
                        value={rightSize}
                        min={240}
                        max={maxRight}
                        change={setRightWidth}
                    />
                    {right}
                </>
            )}
        </div>
    );
}

export function ResizableCatalogue({
    maps,
    children,
}: {
    maps: ReactNode;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { measuredHeight } = useElementSize(ref);
    const mapsRef = useRef<HTMLElement>(null);
    const initialized = useRef(
        storedNumber('sshd-v2:editor:map-list-height', 0) > 0,
    );
    const [height, setHeight] = usePanelSize(
        'sshd-v2:editor:map-list-height',
        370,
    );
    useLayoutEffect(() => {
        if (initialized.current) return;
        const panel = mapsRef.current;
        const list = panel?.querySelector<HTMLElement>('[aria-label="Maps"]');
        const buttons = list
            ? Array.from(list.querySelectorAll('button')).slice(0, 6)
            : [];
        const last = buttons.at(-1);
        if (!panel || !list || !last) return;
        const row = last.getBoundingClientRect();
        const style = getComputedStyle(list);
        const spareRows =
            (6 - buttons.length) *
            (row.height + (parseFloat(style.rowGap) || 0));
        setHeight(
            Math.ceil(
                row.bottom -
                    panel.getBoundingClientRect().top +
                    list.scrollTop +
                    (parseFloat(style.paddingBottom) || 0) +
                    spareRows,
            ),
        );
        initialized.current = true;
    }, [setHeight]);
    const max = Math.max(80, (measuredHeight || 600) - 160);
    const size = Math.max(80, Math.min(max, height));
    return (
        <div className={styles.catalogueStack} ref={ref}>
            <section
                ref={mapsRef}
                className={styles.mapsPane}
                style={{ height: size }}
            >
                {maps}
            </section>
            <Divider
                label="Resize maps and check catalogue"
                horizontal
                value={size}
                min={80}
                max={max}
                change={setHeight}
            />
            <section className={styles.cataloguePane}>{children}</section>
        </div>
    );
}
