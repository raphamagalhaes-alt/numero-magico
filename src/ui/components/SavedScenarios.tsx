import { useState } from 'react';
import { Bookmark, Trash2, Upload } from 'lucide-react';
import type { FormState } from '../form';
import type { MainTab } from '../../scenarios/defaults';
import { loadRaw, save } from '../storage';

export interface SavedScenario { name: string; ticker: string; tab: MainTab; form: FormState; savedAt: string }
const KEY = 'mxrf:scenarios';
export interface Brand { name: string; logo: string | null }
export const loadBrand = (): Brand => { const b = loadRaw<Brand>('mxrf:brand', { name: '', logo: null }); return { name: typeof b.name === 'string' ? b.name.slice(0, 80) : '', logo: typeof b.logo === 'string' && b.logo.startsWith('data:image/') ? b.logo : null }; };

export function SavedScenarios({ current, onLoad }: { current: Omit<SavedScenario, 'name' | 'savedAt'>; onLoad: (s: SavedScenario) => void }) {
  const [list, setList] = useState<SavedScenario[]>(() => { const v = loadRaw<unknown>(KEY, []); return Array.isArray(v) ? (v as SavedScenario[]).filter((x) => x && typeof x.name === 'string' && x.form) : []; });
  const [name, setName] = useState('');
  const [brand, setBrand] = useState<Brand>(loadBrand);
  const persist = (l: SavedScenario[]) => { setList(l); save(KEY, l); };
  const setB = (b: Brand) => { setBrand(b); save('mxrf:brand', b); };
  const onLogo = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type) || f.size > 300 * 1024) return alert('Use uma imagem PNG, JPG, WEBP ou SVG de até 300 KB.');
    const r = new FileReader();
    r.onload = () => setB({ ...brand, logo: String(r.result) });
    r.readAsDataURL(f);
  };
  return (
    <details className="no-print card p-4" data-testid="saved-scenarios">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium hover:text-gold-300"><Bookmark size={15} className="text-gold-400" aria-hidden />Cenários salvos e relatório com sua marca ({list.length})</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = name.trim().slice(0, 60); if (!n) return; persist([{ ...current, name: n, savedAt: new Date().toISOString() }, ...list.filter((x) => x.name !== n)].slice(0, 30)); setName(''); }}>
            <input className="input" placeholder="Nome do cenário" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do cenário" data-testid="sc-name" />
            <button className="btn btn-gold" type="submit" data-testid="sc-save">Salvar</button>
          </form>
          <ul className="flex flex-col gap-1 text-xs">
            {list.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2">
                <span><span className="text-mist-100">{s.name}</span> <span className="text-mist-500">· {s.ticker} · {new Date(s.savedAt).toLocaleDateString('pt-BR')}</span></span>
                <span className="flex gap-1">
                  <button type="button" className="btn !px-2 !py-1 text-[11px]" onClick={() => onLoad(s)} data-testid={`sc-load-${s.name}`}>Abrir</button>
                  <button type="button" className="btn !px-2 !py-1" onClick={() => persist(list.filter((x) => x.name !== s.name))} aria-label={`Excluir ${s.name}`}><Trash2 size={12} aria-hidden /></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 text-xs text-mist-400">
          <label className="flex flex-col gap-1">Nome no relatório PDF (assessor, escritório, educador)<input className="input" value={brand.name} maxLength={80} onChange={(e) => setB({ ...brand, name: e.target.value })} data-testid="brand-name" /></label>
          <label className="btn w-fit cursor-pointer"><Upload size={14} aria-hidden />Logo (até 300 KB)<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} /></label>
          {brand.logo && <span className="flex items-center gap-2"><img src={brand.logo} alt="Logo do relatório" className="h-8" /><button type="button" className="underline" onClick={() => setB({ ...brand, logo: null })}>remover</button></span>}
          <p className="text-[11px] text-mist-500">A marca aparece no cabeçalho do relatório impresso/PDF. Tudo fica salvo só neste navegador.</p>
        </div>
      </div>
    </details>
  );
}
