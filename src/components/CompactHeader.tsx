import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, LogOut, RefreshCw } from 'lucide-react';
import type { AuthConnectionState, CanvaAuthStatus } from '../types/canva';

interface CompactHeaderProps {
  connectionState: AuthConnectionState;
  authStatus: CanvaAuthStatus | null;
  errorMessage: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const CompactHeader: React.FC<CompactHeaderProps> = ({
  connectionState,
  authStatus,
  errorMessage,
  onConnect,
  onDisconnect,
}) => {
  const accountLabel =
    authStatus?.user?.displayName || authStatus?.user?.userId || 'Conta Canva';

  return (
    <header className="sticky top-0 z-30 h-[52px] w-full bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="h-full max-w-6xl mx-auto px-3 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            CANVA LOTE 2.0
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {connectionState === 'disconnected' && (
            <button
              type="button"
              onClick={onConnect}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              Conectar Canva
            </button>
          )}

          {connectionState === 'connecting' && (
            <div className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span>Conectando...</span>
            </div>
          )}

          {connectionState === 'connected' && (
            <div className="flex items-center gap-1.5">
              <div className="min-h-[38px] px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-1.5 max-w-[165px] sm:max-w-[240px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{accountLabel}</span>
              </div>
              <button
                type="button"
                onClick={onDisconnect}
                title="Desconectar conta Canva"
                aria-label="Desconectar conta Canva"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {connectionState === 'error' && (
            <button
              type="button"
              onClick={onConnect}
              title={errorMessage || 'Erro na conexão. Clique para tentar novamente.'}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Tentar novamente</span>
              <RefreshCw className="w-3 h-3 shrink-0" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
