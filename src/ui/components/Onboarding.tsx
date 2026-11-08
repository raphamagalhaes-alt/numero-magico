import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ASSETS, DEFAULT_TICKER } from '../../assets/registry';
import { useUniverse } from '../data';
import { formFromParams, parseBR } from '../form';
import { demoParams } from '../../scenarios/defaults';
import { save } from '../storage';
import { TERMS_KEY, TERMS_VERSION } from '../legal';

export const ONBOARD_KEY = 'mxrf:onboarded';

/** Três perguntas para personalizar o primeiro resultado; o formulário completo continua disponível. */
export function Onboarding({ onDone, termsOnly = false }: { onDone: (ticker: string) => void; termsOnly?: boolean }) {
  const [agree, setAgree] = useState(false);
  const u = useUniverse();
  const [goal, setGoal] = useState('1.000');
  const [contrib, setContrib] = useState('250');
  const [ticker, setTicker] = useState(DEFAULT_TICKER);
  const [err, setErr] = useState<string | null>(null);
  const funds = useMemo(() => (u.data?.assets ?? []).filter((a) => (a.cls === 'FII' || a.cls === 'FIAGRO') && a.cnpj && (a.avgVolume21 ?? 0) > 500000).sort((a, b) => a.ticker.localeCompare(b.ticker)), [u.data]);
  const finish = (skip: boolean) => {
    if (!agree) return setErr('Para continuar, confirme que leu e aceita os termos e o aviso de riscos.');
    save(TERMS_KEY, TERMS_VERSION);
    if (termsOnly) return onDone('');
    if (!skip) {
      const g = parseBR(goal), c = parseBR(contrib);
      if (!g || Number(g) <= 0 || c === null || Number(c) < 0) return setErr('Informe valores válidos.');
      const base = formFromParams(demoParams(DEFAULT_TICKER));
      save('mxrf:form', { ...base, incomeGoal: goal, contribution: contrib });
      save('mxrf:prefs', { mode: ASSETS[ticker]?.demo ? 'demo' : 'market', status: ticker === DEFAULT_TICKER ? 'custom' : 'demo', tab: 'aportes', marketLabel: '', ticker });
    }
    save(ONBOARD_KEY, true);
    onDone(skip ? '' : ticker);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="card w-full max-w-md p-6">
        <h2 id="ob-title" className="flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} className="text-gold-400" aria-hidden />{termsOnly ? 'Antes de começar' : 'Vamos montar sua simulação'}</h2>
        {!termsOnly && <p className="mt-1 text-sm text-mist-400">Três respostas rápidas. Depois você pode ajustar tudo.</p>}
        <div className="mt-4 flex flex-col gap-3">
          {!termsOnly && <>
          <label className="flex flex-col gap-1 text-xs text-mist-400">1. Quanto você quer de renda por mês? (R$)<input autoFocus className="input num" value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="ob-goal" /></label>
          <label className="flex flex-col gap-1 text-xs text-mist-400">2. Quanto pode investir por mês? (R$)<input className="input num" value={contrib} onChange={(e) => setContrib(e.target.value)} data-testid="ob-contrib" /></label>
          <label className="flex flex-col gap-1 text-xs text-mist-400">3. Qual fundo quer simular?
            <select className="input" value={ticker} onChange={(e) => setTicker(e.target.value)} data-testid="ob-ticker">
              <option value={DEFAULT_TICKER}>{DEFAULT_TICKER} — exemplo didático</option>
              {funds.filter((a) => a.ticker !== DEFAULT_TICKER).map((a) => <option key={a.ticker} value={a.ticker}>{a.ticker} — {a.name}</option>)}
            </select>
            <span className="text-[11px] text-mist-500">Lista em ordem alfabética, sem ranking ou indicação de compra.</span>
          </label>
          </>}
          <div className="rounded-md border border-white/10 bg-ink-900/60 p-3 text-[11px] leading-relaxed text-mist-400" data-testid="ob-terms">
            Ferramenta gratuita de <b>uso pessoal e educativo</b>. Não é recomendação de investimento nem consultoria; renda variável pode gerar perdas e projeções não são garantia. Nenhum dado pessoal é coletado: tudo fica neste aparelho.
            <label className="mt-2 flex items-start gap-2 text-mist-200">
              <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(null); }} data-testid="ob-agree" className="mt-0.5" />
              <span>Li e aceito os <a href="#/termos" target="_blank" rel="noreferrer" className="text-gold-300 underline">termos de uso, o aviso de riscos e a política de privacidade</a>.</span>
            </label>
          </div>
          {err && <p className="text-xs text-loss-400" role="alert">{err}</p>}
        </div>
        <div className="mt-5 flex justify-between gap-2">
          {!termsOnly && <button type="button" className="btn" onClick={() => finish(true)}>Pular</button>}
          <button type="button" className="btn btn-gold ml-auto" onClick={() => finish(false)} data-testid="ob-go">{termsOnly ? 'Aceitar e continuar' : 'Ver minha simulação'}</button>
        </div>
      </div>
    </div>
  );
}
