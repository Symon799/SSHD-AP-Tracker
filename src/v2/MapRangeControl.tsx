import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './v2.module.css';

export default function MapRangeControl({
    label,
    sliderLabel,
    value,
    min,
    max,
    onChange,
    children,
}: {
    label: string;
    sliderLabel: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const slider = useRef<HTMLInputElement>(null);
    const id = useId();

    useEffect(() => {
        if (!open) return;
        slider.current?.focus();
        const dismiss = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !root.current?.contains(event.target)
            )
                setOpen(false);
        };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);

    return (
        <div
            className={styles.mapRangeControl}
            ref={root}
            onKeyDown={(event) => {
                if (!open || event.key !== 'Escape') return;
                event.stopPropagation();
                setOpen(false);
                trigger.current?.focus();
            }}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    setOpen(false);
            }}
        >
            <button
                type="button"
                ref={trigger}
                aria-label={label}
                title={label}
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                onClick={() => setOpen(!open)}
            >
                {children}
            </button>
            {open && (
                <div id={id} className={styles.mapRangePopover}>
                    <span aria-hidden="true">{value}%</span>
                    <input
                        type="range"
                        ref={slider}
                        min={min}
                        max={max}
                        value={value}
                        aria-label={sliderLabel}
                        aria-valuetext={`${value}%`}
                        onChange={(event) =>
                            onChange(event.currentTarget.valueAsNumber)
                        }
                    />
                </div>
            )}
        </div>
    );
}
