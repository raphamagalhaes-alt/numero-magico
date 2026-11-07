import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/** Ajuda contextual acessível: abre com foco, hover ou toque; nunca ultrapassa a borda da tela. */
export function InfoTip({ text, label = 'Ajuda' }: { text: string; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const tip = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open || !tip.current) return setShift(0);
    const r = tip.current.getBoundingClientRect();
    const margin = 8;
    if (r.right > window.innerWidth - margin) setShift(window.innerWidth - margin - r.right);
    else if (r.left < margin) setShift(margin - r.left);
  }, [open]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        className="rounded-full p-0.5 text-mist-500 hover:text-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <Info size={13} aria-hidden />
      </button>
      <span
        ref={tip}
        id={id}
        role="tooltip"
        hidden={!open}
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
        className="absolute left-1/2 top-6 z-30 w-64 max-w-[calc(100vw-16px)] rounded-lg bg-ink-700 p-3 text-xs normal-case leading-relaxed tracking-normal text-mist-200 shadow-xl ring-1 ring-white/10"
      >
        {text}
      </span>
    </span>
  );
}
