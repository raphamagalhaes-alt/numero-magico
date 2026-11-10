import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';
import { amountWords, formatTyping, parseNum, regroup } from '../numfmt';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value: string | number; decimals?: boolean };

/** Campo numérico que separa os milhares enquanto a pessoa digita, sem o cursor pular. */
export function NumInput({ value, onChange, decimals = true, inputMode, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  // número (ex.: 89.9) usa ponto decimal; texto já está em pt-BR (pontos de milhar)
  const shown = regroup(typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? ''));
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) ref.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });
  return (
    <input
      {...rest}
      ref={ref}
      value={shown}
      inputMode={inputMode ?? (decimals ? 'decimal' : 'numeric')}
      autoComplete="off"
      onChange={(e) => {
        const r = formatTyping(e.target.value, shown, e.target.selectionStart ?? e.target.value.length, decimals);
        e.target.value = r.text;
        caret.current = r.caret;
        onChange?.(e);
      }}
    />
  );
}

/** "= 2 milhões" embaixo de valores grandes, para ninguém se perder nos zeros. */
export function AmountWords({ value, className = '' }: { value: string | number; className?: string }) {
  const w = amountWords(typeof value === 'number' ? value : parseNum(value));
  return w ? <span className={`block text-[11px] text-gold-300/80 ${className}`} aria-live="polite" data-testid="amount-words">= {w}</span> : null;
}
