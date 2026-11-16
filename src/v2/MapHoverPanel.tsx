import { useRef, type ReactNode } from 'react';
import { useElementSize } from '../utils/React';
import styles from './v2.module.css';

export default function MapHoverPanel({
    anchor,
    label,
    onEnter,
    onLeave,
    children,
}: {
    anchor: DOMRect;
    label: string;
    onEnter: () => void;
    onLeave: () => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLElement>(null);
    const { measuredHeight } = useElementSize(ref);
    const width = Math.min(400, window.innerWidth - 24);
    const left = Math.max(
        12,
        Math.min(
            window.innerWidth - width - 12,
            anchor.right + width + 22 <= window.innerWidth
                ? anchor.right + 10
                : anchor.left - width - 10,
        ),
    );
    // Account for the border: clientHeight already includes the panel padding.
    const top = Math.max(
        12,
        Math.min(anchor.top, window.innerHeight - measuredHeight - 2 - 12),
    );
    return (
        <section
            ref={ref}
            className={`${styles.app} ${styles.hoverPopup}`}
            style={{ left, top, width }}
            role="dialog"
            aria-label={label}
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
        >
            {children}
        </section>
    );
}
