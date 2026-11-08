import { useId, type ReactNode } from 'react';
import { InfoTip } from './InfoTip';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  help?: string;
  prefix?: string;
  suffix?: string;
  inputMode?: 'decimal' | 'numeric';
  testId?: string;
  children?: ReactNode;
}

export function Field({ label, value, onChange, error, help, prefix, suffix, inputMode = 'decimal', testId }: Props) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label flex items-center gap-1">
        {label}
        {help && <InfoTip text={help} label={`Ajuda: ${label}`} />}
      </label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-mist-500">{prefix}</span>}
        <input
          id={id}
          data-testid={testId}
          className={`input num ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-9' : ''} ${error ? 'input-error' : ''}`}
          value={value}
          inputMode={inputMode}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mist-500">{suffix}</span>}
      </div>
      {error && <p id={`${id}-err`} className="text-xs text-loss-400">{error}</p>}
    </div>
  );
}
