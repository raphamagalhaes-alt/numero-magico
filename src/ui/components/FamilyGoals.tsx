import { useEffect, useState } from 'react';
import { Copy, Image as ImageIcon, Share2, Trash2, Users } from 'lucide-react';
import { decodeCard, encodeCard, type FamilyCard } from '../../family/share';
import { fmtBRL, fmtPct } from '../format';
import { loadRaw, save } from '../storage';

const LIST_KEY = 'mxrf:family';
const NAME_KEY = 'mxrf:familyName';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Desenha o cartão de progresso (imagem para mandar no WhatsApp). */
async function cardImage(c: FamilyCard, withValues: boolean): Promise<Blob | null> {
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080;
  const g = cv.getContext('2d'); if (!g) return null;
  g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = '#d4a63a'; g.font = '600 40px system-ui, sans-serif'; g.fillText('Número Mágico · Liberdade financeira', 80, 130);
  g.fillStyle = '#e8eaed'; g.font = '600 64px system-ui, sans-serif'; g.fillText(c.name, 80, 260);
  g.fillStyle = '#e9c46a'; g.font = '700 220px system-ui, sans-serif'; g.fillText(`${Math.round(c.pct * 100)}%`, 70, 500);
  g.fillStyle = '#aeb4bd'; g.font = '36px system-ui, sans-serif'; g.fillText('das contas da casa pagas pelos investimentos', 80, 570);
  g.fillStyle = '#23262b'; g.fillRect(80, 620, 920, 36); g.fillStyle = '#d4a63a'; g.fillRect(80, 620, 920 * c.pct, 36);
  g.fillStyle = '#4cc38a'; g.font = '40px system-ui, sans-serif';
  const paid = c.covered.length ? `✓ Já pagam: ${c.covered.join(', ')}` : 'Começando a jornada!';
  wrap(g, paid, 80, 740, 920, 52);
  g.fillStyle = '#e8eaed'; if (c.next) g.fillText(`Próxima conquista: ${c.next}`, 80, 900);
  g.fillStyle = '#8a919c'; g.font = '30px system-ui, sans-serif';
  g.fillText(`${c.date.split('-').reverse().join('/')}${withValues && c.income !== undefined ? ` · renda ${fmtBRL((c.income ?? 0).toFixed(2))}/mês` : ''}`, 80, 1000);
  return new Promise((r) => cv.toBlob((b) => r(b), 'image/png'));
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > w && line) { g.fillText(line, x, y); y += lh; line = word; } else line = t;
  }
  if (line) g.fillText(line, x, y);
}

export function FamilyGoals({ me }: { me: Omit<FamilyCard, 'name' | 'date'> }) {
  const [name, setName] = useState(() => loadRaw<string>(NAME_KEY, ''));
  const [withValues, setWithValues] = useState(false);
  const [members, setMembers] = useState<FamilyCard[]>(() => { const v = loadRaw<unknown>(LIST_KEY, []); return Array.isArray(v) ? (v as FamilyCard[]) : []; });
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => save(NAME_KEY, name), [name]);
  useEffect(() => save(LIST_KEY, members), [members]);
  const mine: FamilyCard = { ...me, name: name.trim() || 'Eu', date: today() };
  const code = encodeCard(mine, withValues);
  const text = `Meu progresso no Número Mágico: ${Math.round(mine.pct * 100)}% das contas pagas pelos investimentos. Cole este código na página Liberdade para me adicionar: ${code}`;

  const copy = async () => { try { await navigator.clipboard.writeText(text); setMsg('Código copiado. Cole no WhatsApp da família.'); } catch { setMsg('Não foi possível copiar automaticamente: selecione o código abaixo e copie.'); } };
  const share = async () => {
    const blob = await cardImage(mine, withValues);
    const file = blob ? new File([blob], 'minha-liberdade.png', { type: 'image/png' }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch { return; /* cancelado */ }
    if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'minha-liberdade.png'; a.click(); setMsg('Imagem baixada. Mande junto com o código copiado.'); }
  };
  const add = () => {
    const c = decodeCard(paste);
    if (!c) return setMsg('Código inválido. Peça para a pessoa copiar de novo na página Liberdade dela.');
    setMembers((m) => [...m.filter((x) => x.name !== c.name), c]);
    setPaste(''); setMsg(`${c.name} adicionado(a) ao quadro da família.`);
  };
  const board = [{ ...mine, me: true }, ...members.map((m) => ({ ...m, me: false }))].sort((a, b) => b.pct - a.pct);

  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="fam-title" data-testid="family">
      <div>
        <h2 id="fam-title" className="flex items-center gap-2 text-base font-semibold"><Users size={16} className="text-gold-400" aria-hidden />Metas da família</h2>
        <p className="text-xs text-mist-400">Cada pessoa usa o app no próprio aparelho. Para acompanharem juntos, mandem o código (ou a imagem) uns para os outros. O quadro guarda uma cópia do progresso recebido, sem atualização automática: enviem um novo código para atualizar. Sem cadastro e sem servidor; por padrão, nenhum valor em reais é compartilhado.</p>
      </div>
      <ol className="flex flex-col gap-2" data-testid="fam-board">
        {board.map((m) => (
          <li key={(m.me ? 'me:' : '') + m.name} className="rounded-lg bg-ink-850 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <b className={m.me ? 'text-gold-300' : ''}>{m.name}{m.me ? ' (você)' : ''}</b>
              <span className="flex items-center gap-2"><span className="num font-semibold">{fmtPct(m.pct, 0)}</span>
                {!m.me && <button type="button" className="btn !px-1.5 !py-1" aria-label={`Remover ${m.name}`} onClick={() => setMembers((x) => x.filter((y) => y.name !== m.name))}><Trash2 size={12} aria-hidden /></button>}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700"><div className="h-full bg-gold-500" style={{ width: `${m.pct * 100}%` }} /></div>
            <p className="mt-1 text-[11px] text-mist-400">{m.covered.length ? `Já pagam: ${m.covered.join(', ')}` : 'Começando'}{m.next ? ` · próxima: ${m.next}` : ''} · {m.date.split('-').reverse().join('/')}{m.income !== undefined ? ` · ${fmtBRL(m.income.toFixed(2))}/mês` : ''}</p>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-mist-400">Seu nome ou apelido<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Mãe, Rapha" maxLength={30} data-testid="fam-name" /></label>
          <label className="flex items-center gap-2 text-xs text-mist-300"><input type="checkbox" checked={withValues} onChange={(e) => setWithValues(e.target.checked)} />Incluir renda mensal e total das despesas mensais em reais</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={copy} data-testid="fam-copy"><Copy size={14} aria-hidden />Copiar código</button>
            <button type="button" className="btn" onClick={share}>{'share' in navigator ? <Share2 size={14} aria-hidden /> : <ImageIcon size={14} aria-hidden />}Compartilhar imagem</button>
          </div>
          <code className="block break-all rounded bg-ink-900 p-2 text-[10px] text-mist-500" data-testid="fam-code">{code}</code>
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-mist-400">Recebeu um código? Cole aqui<textarea className="input min-h-[70px]" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="NM1:..." data-testid="fam-paste" /></label>
          <button type="button" className="btn btn-gold self-start" onClick={add} data-testid="fam-add">Adicionar ao quadro</button>
        </div>
      </div>
      {msg && <p className="text-xs text-gold-300" role="status">{msg}</p>}
    </section>
  );
}
