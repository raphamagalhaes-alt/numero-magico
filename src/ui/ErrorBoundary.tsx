import { Component, type ReactNode } from 'react';
import { clearAll } from './storage';

/** Última linha de defesa: em vez de tela em branco, oferece redefinir as configurações locais. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-24 max-w-lg rounded-xl bg-ink-900 p-6 text-mist-200 ring-1 ring-white/10">
        <h1 className="text-lg font-semibold">Algo deu errado ao exibir a simulação.</h1>
        <p className="mt-2 text-sm text-mist-400">As configurações salvas neste navegador podem estar corrompidas. Redefinir apaga apenas as preferências locais do simulador.</p>
        <button type="button" className="btn btn-gold mt-4" onClick={() => { clearAll(); window.location.href = window.location.pathname; }}>Redefinir e recarregar</button>
      </div>
    );
  }
}
