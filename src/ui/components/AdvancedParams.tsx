import { SlidersHorizontal } from 'lucide-react';
import { Field } from './Field';
import type { FormField, FormState } from '../form';

const HELP: Partial<Record<FormField, string>> = {
  startMonth: 'Mês do 1º pagamento simulado. Data-com = último dia útil do mês anterior; pagamento = data-com + prazo em dias úteis (calendário B3).',
  paymentLag: 'Dias úteis entre a data-com e o pagamento. No MXRF11, os avisos oficiais recentes mostram 10 dias úteis. Atualizado automaticamente com dados de mercado.',
  costPct: 'Custos proporcionais por ordem (corretagem percentual + emolumentos e liquidação da B3). Consulte a tabela vigente da sua corretora e da B3.',
  costFixed: 'Corretagem fixa por ordem executada, em reais. Muitas corretoras cobram zero.',
  dividendTaxPct: 'IR retido sobre os rendimentos. Para pessoa física, rendimentos de FII podem ser isentos se o fundo e o cotista cumprirem os requisitos legais; o aviso oficial informa a isenção.',
  cgTaxPct: 'IR sobre ganho de capital na venda de cotas de FII (20% para pessoa física). Usado no patrimônio líquido em caso de venda total.',
  cashYieldPct: 'Remuneração anual do saldo residual que fica em caixa entre as compras (ex.: conta remunerada). Juros truncados em centavos.',
};

export function AdvancedParams({ form, errors, edit }: { form: FormState; errors: Partial<Record<FormField, string>>; edit: (k: keyof FormState) => (v: string) => void }) {
  const f = (k: FormField, label: string, extra: { prefix?: string; suffix?: string; inputMode?: 'decimal' | 'numeric' } = {}) => (
    <Field label={label} value={form[k]} onChange={edit(k)} error={errors[k]} help={HELP[k]} testId={`in-${k}`} {...extra} />
  );
  return (
    <details className="no-print card group p-5" data-testid="advanced">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-mist-200 hover:text-gold-300">
        <SlidersHorizontal size={15} className="text-gold-400" aria-hidden />
        Premissas avançadas — datas reais, custos, impostos e caixa
        <span className="ml-auto text-xs text-mist-500 group-open:hidden">expandir</span>
      </summary>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="in-startMonth" className="label">1º pagamento</label>
          <input id="in-startMonth" data-testid="in-startMonth" type="month" className={`input num ${errors.startMonth ? 'input-error' : ''}`} value={form.startMonth} onChange={(e) => edit('startMonth')(e.target.value)} />
          {errors.startMonth && <p role="alert" className="text-xs text-loss-400">{errors.startMonth}</p>}
        </div>
        {f('paymentLag', 'Prazo de pagamento', { suffix: 'd.u.', inputMode: 'numeric' })}
        {f('costPct', 'Custo por ordem', { suffix: '%' })}
        {f('costFixed', 'Custo fixo/ordem', { prefix: 'R$' })}
        {f('dividendTaxPct', 'IR s/ rendimentos', { suffix: '%' })}
        {f('cgTaxPct', 'IR s/ ganho capital', { suffix: '%' })}
        {f('cashYieldPct', 'Rend. do caixa', { suffix: '% a.a.' })}
      </div>
    </details>
  );
}
