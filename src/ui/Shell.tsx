import { useEffect, useState } from 'react';
import { getCompareList } from './pages/Explorer';
import { loadRaw as loadRawPref } from './storage';
import { BarChart3, Bell } from 'lucide-react';
import { SimulatorPage } from './App';
import { ExplorerPage } from './pages/Explorer';
import { ComparePage } from './pages/Compare';
import { RatesPage } from './pages/Rates';
import { PortfolioPage, loadPositions, newDividendAlerts } from './pages/Portfolio';
import { DataStatusPage } from './pages/DataStatus';
import { Onboarding, ONBOARD_KEY } from './components/Onboarding';
import { DISCLAIMER } from './report';
import { PAGES, go, useRoute } from './route';
import { useUniverse } from './data';
import { loadRaw } from './storage';

export function Shell() {
  const route = useRoute();
  const [simKey, setSimKey] = useState(0);
  const [onboard, setOnboard] = useState(() => window.location.search.includes('onboarding=1') || (!loadRaw(ONBOARD_KEY, false) && !window.location.search.includes('t=') && !window.navigator.webdriver));
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
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-4 pb-10 sm:px-6">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-gold-500 focus:px-3 focus:py-2 focus:text-ink-950">Pular para o conteúdo</a>
      <header className="no-print z-40 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-ink-950/85 px-4 py-3 backdrop-blur sm:sticky sm:top-0 sm:-mx-6 sm:px-6">
        <a href="#/simulador" className="flex items-center gap-3" aria-label="Número Mágico — início">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 text-ink-950" aria-hidden><BarChart3 size={18} /></span>
          <span>
            <span className="block text-base font-semibold tracking-tight sm:text-lg">Número Mágico</span>
            <span className="block text-[11px] text-mist-500">Simulador e explorador de investimentos · dados oficiais</span>
          </span>
        </a>
        <nav aria-label="Páginas" className="-mx-1 flex max-w-full gap-1 overflow-x-auto text-xs">
          {PAGES.map((p) => (
            <a key={p.id} href={`#/${p.id}`} aria-current={route.page === p.id ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition ${route.page === p.id ? 'bg-ink-700 text-gold-300' : 'text-mist-300 hover:text-mist-100'}`}>
              {p.label}{p.id === 'carteira' && alerts.length > 0 && <Bell size={11} className="ml-1 inline text-gold-400" aria-label={`${alerts.length} novos rendimentos`} />}
            </a>
          ))}
        </nav>
      </header>

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
      </main>

      <footer className="mt-auto flex flex-col gap-2 border-t border-white/5 pt-6 text-xs text-mist-500">
        <p data-testid="disclaimer" className="text-mist-400">{DISCLAIMER}</p>
        <p>Fontes oficiais: B3 (COTAHIST), Fundos.NET (B3/CVM), CVM Dados Abertos, Banco Central do Brasil (SGS), Tesouro Transparente, BIS, Federal Reserve Bank of New York e Banco Central Europeu. Ferramenta independente, sem vínculo com essas instituições. Filtros e comparações são objetivos e não constituem recomendação.</p>
      </footer>

      {onboard && <Onboarding onDone={(t) => { setOnboard(false); setSimKey((k) => k + 1); go('simulador', t ? { t } : undefined); }} />}
    </div>
  );
}
