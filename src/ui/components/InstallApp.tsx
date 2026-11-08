import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/** Botão "Instalar app" (Chrome/Edge/Android) e instruções para iPhone/iPad (Safari). */
export function InstallApp() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', on);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (standalone || (!evt && !ios)) return null;
  return (
    <span className="relative">
      <button type="button" className="btn !py-1.5 text-xs" data-testid="install-app"
        onClick={async () => { if (evt) { await evt.prompt(); await evt.userChoice; setEvt(null); } else setHelp((h) => !h); }}>
        <Download size={13} aria-hidden />Instalar app
      </button>
      {help && (
        <span role="dialog" className="absolute right-0 top-10 z-50 w-64 rounded-lg bg-ink-700 p-3 text-xs text-mist-200 shadow-xl ring-1 ring-white/10">
          No iPhone/iPad (Safari): toque em <strong>Compartilhar</strong> (quadrado com seta) → <strong>Adicionar à Tela de Início</strong>.
        </span>
      )}
    </span>
  );
}
