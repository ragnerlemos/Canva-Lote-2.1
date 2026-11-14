import React from 'react';
import { Activity, CheckCircle2, Clock, ShieldCheck, X } from 'lucide-react';
import type { CanvaBridgeBatch } from '../types/canva';

interface BridgeDiagnosticModalProps {
  batch: CanvaBridgeBatch | null;
  isOpen: boolean;
  onClose: () => void;
}

export const BridgeDiagnosticModal: React.FC<BridgeDiagnosticModalProps> = ({
  batch,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const createdAtDate = batch ? new Date(batch.createdAt).toLocaleTimeString('pt-BR') : '-';
  const syncedAtDate = batch?.syncedAt ? new Date(batch.syncedAt).toLocaleTimeString('pt-BR') : '-';
  const hasInspection = Boolean(batch?.inspection);
  const reports = batch?.pageReports || [];
  const okCount = reports.filter((r) => r.status === 'success').length;
  const errorCount = reports.filter((r) => r.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold tracking-wide">
              Painel de Diagnóstico da Ponte (Canva Bridge)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-700">
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 space-y-1">
            <p className="font-semibold text-xs flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Por que o status fica em "Aguardando sincronização no editor"?</span>
            </p>
            <p className="text-[11px] text-indigo-900 leading-relaxed">
              O aplicativo externo (esta aba) envia os dados para o servidor e gera um código. Para que o lote seja aplicado, <strong>o design precisa estar aberto no Editor do Canva</strong> e o nosso app interno <strong>Canva Lote 2.0</strong> deve estar aberto na barra lateral do editor para executar <code>session.sync()</code>. Se você estiver apenas no app externo sem abrir o app no Editor do Canva, o processo aguardará até que o app interno seja aberto ou ocorra o tempo limite (timeout).
            </p>
          </div>

          {batch ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">ID da Operação</span>
                  <p className="font-mono text-slate-900 font-bold truncate">{batch.batchId}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Código de Transferência</span>
                  <p className="font-mono text-base text-indigo-700 font-bold tracking-widest">{batch.transferCode}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="font-semibold text-slate-900 uppercase tracking-wide text-[11px]">
                  Detalhes da Requisição e Sincronização
                </h4>
                <ul className="space-y-1 text-[11px] text-slate-600">
                  <li className="flex justify-between">
                    <span className="text-slate-500">Design Alvo:</span>
                    <strong className="text-slate-900 truncate max-w-[260px]">{batch.designTitle}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">ID do Design:</span>
                    <span className="font-mono text-slate-800">{batch.designId || 'Não vinculado'}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Horário de Início:</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {createdAtDate}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Status Atual:</span>
                    <strong className="uppercase text-indigo-700">{batch.status}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Páginas / Frases:</span>
                    <span className="font-semibold text-slate-900">{batch.pages.length} página(s)</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Inspeção do Editor:</span>
                    <span className="font-semibold text-slate-900">
                      {hasInspection ? `${batch.inspection?.totalPages} pág. · ${batch.inspection?.totalVideosBefore} vídeo(s)` : 'Aguardando abertura no Canva'}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">Resultado session.sync():</span>
                    <span className="font-semibold text-emerald-700">
                      {batch.status === 'synced' ? `${okCount} ok · ${errorCount} erro(s) · ${syncedAtDate}` : 'Pendente de execução no Canva'}
                    </span>
                  </li>
                </ul>
              </div>

              {batch.errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[11px]">
                  <strong>Erro reportado:</strong> {batch.errorMessage}
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-slate-500 py-6">
              Nenhuma operação ativa registrada nesta sessão.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer"
          >
            Fechar Diagnóstico
          </button>
        </div>
      </div>
    </div>
  );
};
