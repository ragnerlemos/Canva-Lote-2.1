import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  BridgePageSyncReport,
  CanvaBridgeBatch,
  EditorSafetyInspection,
} from '../types/canva';

interface CanvaEditorBridgeCardProps {
  compact?: boolean;
  inspection: EditorSafetyInspection | null;
  isInspecting: boolean;
  activeBatch: CanvaBridgeBatch | null;
  recentCandidatesCount: number;
  isLookingUpBatch: boolean;
  isSyncingBridgeBatch: boolean;
  syncError: string | null;
  lastSyncedReports: BridgePageSyncReport[];
  lastOutlineNote?: string;
  onRefreshInspection: () => void;
  onLookupByCode: (code?: string) => void;
  onApplyAndSyncBatch: () => void;
  onTriggerNativeExport: () => void;
  onOpenExportTab?: () => void;
}

export const CanvaEditorBridgeCard: React.FC<CanvaEditorBridgeCardProps> = ({
  compact = false,
  inspection,
  isInspecting,
  activeBatch,
  recentCandidatesCount,
  isLookingUpBatch,
  isSyncingBridgeBatch,
  syncError,
  lastSyncedReports,
  lastOutlineNote,
  onRefreshInspection,
  onLookupByCode,
  onApplyAndSyncBatch,
  onTriggerNativeExport,
  onOpenExportTab,
}) => {
  const [codeInput, setCodeInput] = useState('');

  const batchPhraseCount = activeBatch
    ? activeBatch.pages.filter((p) => p.phrase.trim().length > 0).length
    : 0;
  const isAlreadySynced = activeBatch?.status === 'synced' && lastSyncedReports.length > 0;
  const okSyncedCount = lastSyncedReports.filter((r) => r.status === 'success').length;
  const preservedVideoCount = lastSyncedReports.reduce((acc, r) => acc + r.videosAfter, 0);

  if (compact) {
    if (!activeBatch && !syncError) {
      return (
        <div className="px-3 py-2 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              {inspection
                ? `Editor Canva: ${inspection.totalPages} pág. · ${inspection.totalVideosBefore} vídeo(s) intacto(s)`
                : 'Conectado ao Editor do Canva'}
            </span>
          </div>
          <button
            type="button"
            disabled={isLookingUpBatch}
            onClick={() => onLookupByCode()}
            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shrink-0 inline-flex items-center gap-1 cursor-pointer"
          >
            {isLookingUpBatch ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            <span>
              {recentCandidatesCount > 0
                ? `Lotes (${recentCandidatesCount})`
                : 'Buscar lote'}
            </span>
          </button>
        </div>
      );
    }

    return (
      <div className="px-3 py-2.5 bg-indigo-950 text-white border-b border-indigo-900 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-indigo-200 text-[11px] uppercase tracking-wide truncate">
              {isAlreadySynced
                ? `Sincronizado (${activeBatch?.transferCode})`
                : `Lote recebido · Cód. ${activeBatch?.transferCode}`}
            </p>
            <p className="text-[11px] text-white/90 truncate">
              {activeBatch?.designTitle} · {batchPhraseCount} frase(s)
              {inspection ? ` · ${inspection.totalVideosBefore} vídeo(s) preservados` : ''}
            </p>
          </div>
          {onOpenExportTab && (
            <button
              type="button"
              onClick={onOpenExportTab}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold shrink-0 cursor-pointer"
            >
              Detalhes
            </button>
          )}
        </div>

        {syncError && (
          <p className="text-[11px] text-amber-300 leading-snug">{syncError}</p>
        )}

        {isAlreadySynced ? (
          <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-300">
            <span className="inline-flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {okSyncedCount} camada(s) aplicadas · {preservedVideoCount} vídeo(s) intacto(s)
            </span>
            <button
              type="button"
              onClick={onTriggerNativeExport}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shrink-0 cursor-pointer"
            >
              Exportar
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isSyncingBridgeBatch}
            onClick={onApplyAndSyncBatch}
            className="w-full min-h-[38px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isSyncingBridgeBatch ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>APLICANDO E SINCRONIZANDO...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>SALVAR NO CANVA (Aplicar Lote)</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/50 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Ponte Editor do Canva (@canva/design)
          </h3>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
            Recebe as frases preparadas no aplicativo externo e insere cada texto diretamente sobre o vídeo original com verificação pós-sincronização.
          </p>
        </div>
        <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
      </div>

      {/* Live Safety Inspection */}
      <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-800">
            Inspeção do design aberto
          </span>
          <button
            type="button"
            disabled={isInspecting}
            onClick={onRefreshInspection}
            className="text-[11px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            {isInspecting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            <span>Reverificar</span>
          </button>
        </div>

        {inspection ? (
          <div className="space-y-1 text-[11px] text-slate-600">
            <p className="tabular-nums">
              <strong>{inspection.designTitle}</strong> · {inspection.totalPages} página(s) ·{' '}
              <strong>{inspection.totalVideosBefore} vídeo(s)</strong> ·{' '}
              {inspection.supportedPagesCount} compatível(is)
            </p>
            {inspection.hasWarnings && (
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-0.5">
                <div className="flex items-center gap-1 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Avisos de compatibilidade:</span>
                </div>
                {inspection.warnings.map((w, i) => (
                  <p key={i}>• {w}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            {isInspecting ? 'Inspecionando páginas e vídeos...' : 'Aguardando inspeção do design.'}
          </p>
        )}
      </div>

      {/* Lookup by Transfer Code */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onLookupByCode(codeInput.trim() || undefined);
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="text"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          placeholder="Código de transferência (ex: K7P9M2)"
          className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-300 bg-white text-xs font-mono uppercase tracking-wider text-slate-900 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isLookingUpBatch}
          className="min-h-[40px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          {isLookingUpBatch ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          <span>Buscar</span>
        </button>
      </form>

      {activeBatch ? (
        <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-900 truncate">
              Lote {activeBatch.transferCode} — {activeBatch.designTitle}
            </span>
            <span className="text-[11px] font-semibold text-indigo-700 shrink-0 tabular-nums">
              {batchPhraseCount} frase(s)
            </span>
          </div>

          <div className="max-h-[112px] overflow-y-auto space-y-1 text-[11px] text-slate-700">
            {activeBatch.pages
              .filter((p) => p.phrase.trim().length > 0)
              .map((p) => (
                <div
                  key={p.pageNumber}
                  className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    <strong className="text-slate-900">Pág. {p.pageNumber}:</strong> {p.phrase}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                    style={{ backgroundColor: p.style.color }}
                    title={`${p.style.fontFamily} · ${p.style.fontSize}`}
                  />
                </div>
              ))}
          </div>

          {activeBatch.pages.some((p) => p.style.outlineEnabled) && (
            <p className="text-[11px] text-slate-500 leading-snug">
              Nota da API do Canva: texto, fonte, tamanho, cor, alinhamento, espaçamento e posição são gravados nativamente. Caso queira efeito Contorno, aplique em <em>Texto → Efeitos → Contorno</em> após sincronizar.
            </p>
          )}

          <button
            type="button"
            disabled={isSyncingBridgeBatch}
            onClick={onApplyAndSyncBatch}
            className="w-full min-h-[46px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-55 text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSyncingBridgeBatch ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>APLICANDO E SINCRONIZANDO NO CANVA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>SALVAR NO CANVA (Aplicar e Sincronizar)</span>
              </>
            )}
          </button>

          {lastOutlineNote && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              {lastOutlineNote}
            </p>
          )}

          {isAlreadySynced && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  session.sync() confirmado: {okSyncedCount} página(s) sincronizada(s) ·{' '}
                  {preservedVideoCount} vídeo(s) preservado(s)!
                </span>
              </div>
              <button
                type="button"
                onClick={onTriggerNativeExport}
                className="w-full min-h-[40px] px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar do Canva (Vídeo MP4 / PPTX / PNG)</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-600">
          Nenhum lote selecionado ainda. Envie pelo app externo ("SALVAR NO CANVA") ou digite o código acima para puxar automaticamente.
        </p>
      )}

      {syncError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {syncError}
        </p>
      )}
    </div>
  );
};
