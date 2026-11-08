import { useEffect, useState } from 'react';
import { getCompareList } from './pages/Explorer';
import { loadRaw as loadRawPref } from './storage';
import { BarChart3, Bell, Calculator, Search, GitCompare, Landmark, Wallet, RefreshCw, type LucideIcon } from 'lucide-react';
import { SimulatorPage } from './App';
import { ExplorerPage } from './pages/Explorer';
import { ComparePage } from './pages/Compare';
import { RatesPage } from './pages/Rates';
import { PortfolioPage, loadPositions, newDividendAlerts } from './pages/Portfolio';
import { DataStatusPage } from './pages/DataStatus';
import { LegalPage } from './pages/Legal';
import { TERMS_KEY, TERMS_VERSION } from './legal';
import { Onboarding, ONBOARD_KEY } from './components/Onboarding';
import { DISCLAIMER } from './report';
import { PAGES, go, useRoute } from './route';
import { useUniverse } from './data';
import { loadRaw } from './storage';
import { IS_WEB } from './mode';
import { InstallApp } from './components/InstallApp';

const ICONS: Record<string, LucideIcon> = { simulador: Calculator, explorar: Search, comparar: GitCompare, juros: Landmark, carteira: Wallet, dados: RefreshCw };

export function Shell() {
  const route = useRoute();
  const [simKey, setSimKey] = useState(0);
  const forced = window.location.search.includes('onboarding=1');
  const [onboard, setOnboard] = useState(() => forced || (!window.navigator.webdriver && (!loadRaw(ONBOARD_KEY, false) || loadRaw<string>(TERMS_KEY, '') !== TERMS_VERSION)));
  // link compartilhado (?t=) ou quem já configurou: pede só o aceite, sem refazer as perguntas
  const termsOnly = !forced && (loadRaw(ONBOARD_KEY, false) || window.location.search.includes('t='));
  const u = useUniverse();
  // recalculado a cada renderização (barato): reflete "marcar como visto" ao voltar da carteira
  const alerts = u.data ? newDividendAlerts(loadPositions(), u.data.assets) : [];

  // lista de acompanhamento (carteira + comparação + simulador) enviada ao servidor LOCAL para as cotações pessoais
  useEffect(() => {
    const sim = loadRawPref<{ ticker?: string }>('mxrf:prefs', {}).ticker;
    const list = [...new Set([...loadPositions().map((p) => p.ticker), ...getCompareList(), ...(sim ? [sim] : [])])].sort();
    const key = list.join(',');
    if (key === loadRawPref('mxrf:watchlistSent', '')) return;
    fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mxrf11' }, body: JSON.stringify({ watchlist: list }) })
      .then((r) => { if (r.ok) { try { localStorage.setItem('mxrf:watchlistSent', JSON.stringify(key)); } catch { /* ignore */ } } })
      .catch(() => undefined);
  }, [route.page, route.params]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-4 pb-24 sm:px-6 sm:pb-10">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-gold-500 focus:px-3 focus:py-2 focus:text-ink-950">Pular para o conteúdo</a>
      <header className="no-print z-40 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-ink-950/85 px-4 py-3 backdrop-blur sm:sticky sm:top-0 sm:-mx-6 sm:px-6">
        <a href="#/simulador" className="flex items-center gap-3" aria-label="Número Mágico — início">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 text-ink-950" aria-hidden><BarChart3 size={18} /></span>
          <span>
            <span className="block text-base font-semibold tracking-tight sm:text-lg">Número Mágico</span>
            <span className="block text-[11px] text-mist-500">Planeje sua renda com investimentos</span>
          </span>
        </a>
        {IS_WEB && <InstallApp />}
        <nav aria-label="Páginas" className="-mx-1 hidden max-w-full gap-1 overflow-x-auto text-xs sm:flex">
          {PAGES.map((p) => (
            <a key={p.id} href={`#/${p.id}`} aria-current={route.page === p.id ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition ${route.page === p.id ? 'bg-ink-700 text-gold-300' : 'text-mist-300 hover:text-mist-100'}`}>
              {p.label}{p.id === 'carteira' && alerts.length > 0 && <Bell size={11} className="ml-1 inline text-gold-400" aria-label={`${alerts.length} novos rendimentos`} />}
            </a>
          ))}
        </nav>
      </header>

      <nav aria-label="Menu" data-testid="bottom-nav" className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-white/10 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {PAGES.map((p) => {
          const Icon = ICONS[p.id] ?? Calculator;
          const on = route.page === p.id;
          return (
            <a key={p.id} href={`#/${p.id}`} aria-current={on ? 'page' : undefined} className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] ${on ? 'text-gold-300' : 'text-mist-400'}`}>
              <Icon size={20} aria-hidden />{p.label}
              {p.id === 'carteira' && alerts.length > 0 && <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-gold-400" aria-label="novos rendimentos" />}
            </a>
          );
        })}
      </nav>

      {alerts.length > 0 && route.page !== 'carteira' && (
        <button type="button" className="no-print card flex items-center gap-2 p-3 text-left text-xs text-gold-300 ring-gold-500/40" onClick={() => go('carteira')} data-testid="alert-banner">
          <Bell size={14} aria-hidden />Novo rendimento anunciado para {alerts.map((a) => a.ticker).join(', ')} na sua carteira — ver detalhes
        </button>
      )}

      <main id="conteudo" className="flex flex-col gap-6">
        {route.page === 'simulador' && <SimulatorPage key={simKey} requestedTicker={route.params.get('t')} />}
        {route.page === 'explorar' && <ExplorerPage />}
        {route.page === 'comparar' && <ComparePage tickersParam={route.params.get('t')} />}
        {route.page === 'juros' && <RatesPage />}
        {route.page === 'carteira' && <PortfolioPage />}
        {route.page === 'dados' && <DataStatusPage />}
        {route.page === 'termos' && <LegalPage />}
      </main>

      <footer className="mt-auto flex flex-col gap-2 border-t border-white/5 pt-6 text-xs text-mist-500">
        <p data-testid="disclaimer" className="text-mist-400">{DISCLAIMER}</p>
        <p>Fontes oficiais: B3 (COTAHIST), Fundos.NET (B3/CVM), CVM Dados Abertos, Banco Central do Brasil (SGS), Tesouro Transparente, BIS, Federal Reserve Bank of New York e Banco Central Europeu. Ferramenta independente, sem vínculo com essas instituições. Filtros e comparações são objetivos e não constituem recomendação. Base open-data.json sob ODbL. Source: BIS. Source: ECB statistics.</p>
        <p className="flex flex-wrap gap-3"><a href="#/termos" className="text-gold-300 underline" data-testid="legal-link">Termos de uso · Riscos · Privacidade (LGPD) · Fontes e licenças</a><span>Uso pessoal e gratuito, sem fins comerciais. Nenhum dado pessoal é coletado.</span></p>
      </footer>

      {onboard && route.page !== 'termos' && <Onboarding termsOnly={termsOnly} onDone={(t) => { if (termsOnly) { setOnboard(false); return; } setOnboard(false); setSimKey((k) => k + 1); go('simulador', t ? { t } : undefined); }} />}
    </div>
  );
}
