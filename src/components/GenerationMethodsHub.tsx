import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  Lock,
  PauseCircle,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  generateEditablePageInEditor,
  type DuplicatePageTestReport,
} from '../integrations/canva/designSdkClient';
import { copyCanvaDesignRest } from '../integrations/canva/restApiClient';
import { isCanvaEditorHost } from '../intents/design_editor';
import type {
  CanvaDesignSummary,
  CanvaTextLayer,
  OverlayPageItem,
  TextAppearanceConfig,
} from '../types/canva';

export type GenerationMethodId =
  | 'method1_duplicate_page'
  | 'method2_reconstruct_elements'
  | 'method3_duplicate_design';

export interface MethodPageResult {
  index: number;
  phrase: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  pageId?: string;
  designId?: string;
  editUrl?: string;
  errorMessage?: string;
  methodUsed?: string;
}

interface GenerationMethodsHubProps {
  phrases: string[];
  pages?: OverlayPageItem[];
  selectedDesign?: CanvaDesignSummary | null;
  selectedPageNumber?: number;
  selectedLayer?: CanvaTextLayer | null;
  targetText?: string;
  appearance?: TextAppearanceConfig;
  onOpenInCanvaEditor?: () => void;
  className?: string;
}

export const GenerationMethodsHub: React.FC<GenerationMethodsHubProps> = ({
  phrases,
  pages = [],
  selectedDesign = null,
  selectedPageNumber = 1,
  selectedLayer = null,
  targetText = '',
  appearance,
  onOpenInCanvaEditor,
  className = '',
}) => {
  const inEditor = isCanvaEditorHost();

  const [selectedMethod, setSelectedMethod] =
    useState<GenerationMethodId>('method1_duplicate_page');
  const [pageLimit, setPageLimit] = useState<number>(0); // 0 = all
  const [preserveOriginal, setPreserveOriginal] = useState<boolean>(true);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStepText, setCurrentStepText] = useState<string | null>(null);
  const [progressCount, setProgressCount] = useState<number>(0);
  const [results, setResults] = useState<MethodPageResult[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [method3DesignResult, setMethod3DesignResult] = useState<{
    id: string;
    title: string;
    editUrl?: string;
    viewUrl?: string;
  } | null>(null);

  const abortControllerRef = useRef<boolean>(false);

  // Extract non-empty phrases
  const cleanPhrases = phrases
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const totalAvailable = cleanPhrases.length;
  const effectiveCount =
    pageLimit > 0 ? Math.min(pageLimit, totalAvailable) : totalAvailable;
  const phrasesToProcess = cleanPhrases.slice(0, effectiveCount);

  const handleInterrupt = () => {
    abortControllerRef.current = true;
    setCurrentStepText('Interrompendo geração após a página atual...');
  };

  const handleStartGeneration = async () => {
    if (phrasesToProcess.length === 0 && selectedMethod !== 'method3_duplicate_design') {
      setGlobalError('Insira ao menos uma frase para gerar.');
      return;
    }

    abortControllerRef.current = false;
    setIsRunning(true);
    setGlobalError(null);
    setMethod3DesignResult(null);
    setProgressCount(0);

    // Initial queue
    const initialResults: MethodPageResult[] = phrasesToProcess.map((p, idx) => ({
      index: idx + 1,
      phrase: p,
      status: 'pending',
    }));
    setResults(initialResults);

    try {
      // =========================================================================
      // MÉTODO 3: DUPLICAR O DESIGN ORIGINAL (Canva Connect REST API)
      // =========================================================================
      if (selectedMethod === 'method3_duplicate_design') {
        const designId = selectedDesign?.id;
        if (!designId) {
          throw new Error(
            'Selecione um design da sua conta Canva na aba Template para duplicar via REST API.'
          );
        }

        setCurrentStepText('Duplicando projeto completo via Canva Connect REST API...');
        const copyTitle = `${selectedDesign.title || 'Design'} (Cópia Lote)`;
        const copyResult = await copyCanvaDesignRest(designId, copyTitle);

        setMethod3DesignResult(copyResult);
        setProgressCount(1);
        setResults([
          {
            index: 1,
            phrase: `Cópia completa criada (${copyResult.title})`,
            status: 'success',
            designId: copyResult.id,
            editUrl: copyResult.editUrl,
            methodUsed: 'POST /v1/designs (Connect API)',
          },
        ]);
        return;
      }

      // =========================================================================
      // MÉTODO 1 (DUPLICAR PÁGINA NATIVA) & MÉTODO 2 (CRIAR E RECONSTRUIR PÁGINA)
      // =========================================================================
      if (!inEditor) {
        throw new Error(
          'Os Métodos 1 e 2 operam diretamente dentro do Editor do Canva. Abra seu design no Canva com o app Canva Lote 2.0 (App ID: AAHOGGtX324) para executar.'
        );
      }

      for (let i = 0; i < phrasesToProcess.length; i++) {
        if (abortControllerRef.current) {
          setCurrentStepText('Geração interrompida pelo usuário.');
          break;
        }

        const currentPhrase = phrasesToProcess[i];
        setCurrentStepText(
          `Processando página ${i + 1} de ${phrasesToProcess.length} com ${
            selectedMethod === 'method1_duplicate_page'
              ? 'MÉTODO 1 (duplicatePage Preview)'
              : 'MÉTODO 2 (addPage Reconstrutivo)'
          }...`
        );

        setResults((prev) =>
          prev.map((r, idx) => (idx === i ? { ...r, status: 'processing' } : r))
        );

        try {
          const res = await generateEditablePageInEditor({
            sourcePageNumber: selectedPageNumber,
            targetLayer: selectedLayer,
            targetText,
            replacementPhrase: currentPhrase,
            appearance,
            batchIndex: i + 1,
            forceMethod:
              selectedMethod === 'method1_duplicate_page'
                ? 'method1_duplicate_page'
                : 'method2_reconstruct_elements',
          });

          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: 'success',
                    pageId: res.pageId,
                    methodUsed: res.verification.method,
                  }
                : r
            )
          );
        } catch (itemErr) {
          const msg =
            itemErr instanceof Error ? itemErr.message : 'Falha ao processar página.';
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, status: 'error', errorMessage: msg } : r
            )
          );
        }

        setProgressCount(i + 1);
      }
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : 'Falha na execução da geração.'
      );
    } finally {
      setIsRunning(false);
      setCurrentStepText(null);
    }
  };

  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const progressPct =
    results.length > 0 ? Math.round((progressCount / results.length) * 100) : 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header Central de Métodos */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 p-3.5 sm:p-4 space-y-1.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-indigo-600 text-white shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-xs sm:text-sm font-extrabold tracking-tight text-slate-900 uppercase">
              COMO DESEJA GERAR SEUS DESIGNS?
            </h2>
          </div>
          <span className="text-[10px] font-mono-tabular font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            3 Métodos Oficiais
          </span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Selecione a estratégia técnica oficial da Canva que melhor atende ao seu projeto. Todos os métodos preservam o design original sem conversões para imagem.
        </p>
      </div>

      {/* Grid com os 3 Métodos Selecionáveis */}
      <div className="space-y-2.5">
        {/* MÉTODO 1 — DUPLICAR PÁGINA NATIVA */}
        <div
          onClick={() => setSelectedMethod('method1_duplicate_page')}
          className={`rounded-xl border p-3 cursor-pointer transition relative ${
            selectedMethod === 'method1_duplicate_page'
              ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-600/20 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900">
                  MÉTODO 1 — DUPLICAR PÁGINA NATIVA
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  Preview Oficial
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Utiliza a nova API oficial <code className="text-indigo-700 font-mono font-semibold">duplicatePage()</code> do Canva Apps SDK. Clona a página original inteira com todos os seus elementos e substitui exclusivamente o texto alvo.
              </p>
            </div>
            <button
              type="button"
              className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition ${
                selectedMethod === 'method1_duplicate_page'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {selectedMethod === 'method1_duplicate_page' ? 'SELECIONADO' : 'SELECIONAR'}
            </button>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
            <div className="text-emerald-700 leading-tight">
              <strong>Vantagens:</strong> Preserva 100% dos vídeos MP4, timing, animações e layout pelo motor Canva.
            </div>
            <div className="text-slate-500 leading-tight">
              <strong>Limitações:</strong> Requer execução no Editor Canva. Disponível em hosts com suporte à API Preview.
            </div>
          </div>
        </div>

        {/* MÉTODO 2 — CRIAR PÁGINA E RECONSTRUIR ELEMENTOS */}
        <div
          onClick={() => setSelectedMethod('method2_reconstruct_elements')}
          className={`rounded-xl border p-3 cursor-pointer transition relative ${
            selectedMethod === 'method2_reconstruct_elements'
              ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-600/20 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900">
                  MÉTODO 2 — CRIAR PÁGINA E RECONSTRUIR ELEMENTOS
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Estável GA
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Cria novas páginas dentro do design aberto com <code className="text-indigo-700 font-mono font-semibold">addPage()</code> e reconstrói fundos, mídias com <code className="text-slate-700 font-mono font-semibold">VideoRef</code> / <code className="text-slate-700 font-mono font-semibold">ImageRef</code> e formas nativas.
              </p>
            </div>
            <button
              type="button"
              className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition ${
                selectedMethod === 'method2_reconstruct_elements'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {selectedMethod === 'method2_reconstruct_elements' ? 'SELECIONADO' : 'SELECIONAR'}
            </button>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
            <div className="text-emerald-700 leading-tight">
              <strong>Vantagens:</strong> Totalmente estável e suportado em todas as contas Canva com Apps SDK.
            </div>
            <div className="text-slate-500 leading-tight">
              <strong>Limitações:</strong> Requer execução no Editor Canva. Não clona elementos proprietários de outros apps.
            </div>
          </div>
        </div>

        {/* MÉTODO 3 — DUPLICAR O DESIGN ORIGINAL */}
        <div
          onClick={() => setSelectedMethod('method3_duplicate_design')}
          className={`rounded-xl border p-3 cursor-pointer transition relative ${
            selectedMethod === 'method3_duplicate_design'
              ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-600/20 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900">
                  MÉTODO 3 — DUPLICAR O DESIGN ORIGINAL
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  REST Connect API
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Utiliza a Canva Connect REST API (<code className="text-indigo-700 font-mono font-semibold">POST /v1/designs</code>) para criar uma cópia independente de todo o projeto na sua galeria do Canva, isolando 100% o arquivo original.
              </p>
            </div>
            <button
              type="button"
              className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition ${
                selectedMethod === 'method3_duplicate_design'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {selectedMethod === 'method3_duplicate_design' ? 'SELECIONADO' : 'SELECIONAR'}
            </button>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
            <div className="text-emerald-700 leading-tight">
              <strong>Vantagens:</strong> Funciona pelo backend OAuth sem depender do editor estar aberto. Design original intocado.
            </div>
            <div className="text-amber-700 leading-tight">
              <strong>Limitações:</strong> A API REST cria a cópia independente, mas a edição de texto interna exige abrir o editor Canva.
            </div>
          </div>
        </div>
      </div>

      {/* Configurações de Geração */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 text-xs">
        <div className="font-bold text-slate-900 text-xs">Configurações de Geração</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-slate-500 text-[11px]">Quantidade de frases disponíveis</span>
            <div className="font-bold text-slate-900 font-mono-tabular text-sm">
              {totalAvailable} frase(s) preenchida(s)
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
            <label htmlFor="gen-page-limit" className="text-slate-500 text-[11px] block">
              Quantidade de páginas a gerar
            </label>
            <div className="flex items-center gap-2">
              <input
                id="gen-page-limit"
                type="number"
                min={0}
                max={totalAvailable || 999}
                value={pageLimit === 0 ? totalAvailable : pageLimit}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setPageLimit(val >= totalAvailable ? 0 : Math.max(1, val));
                }}
                disabled={isRunning}
                className="w-16 h-7 px-2 rounded border border-slate-300 text-right font-mono-tabular font-bold text-slate-900 bg-white"
              />
              <span className="text-slate-500 text-[11px] font-mono-tabular">
                de {totalAvailable}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-1.5 border-t border-slate-100 flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={preserveOriginal}
              onChange={(e) => setPreserveOriginal(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-[11px] font-semibold text-slate-800 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              Preservar design original (ativado por padrão — nunca modifica o original)
            </span>
          </label>

          <div className="text-[11px] text-slate-500">
            {selectedMethod === 'method3_duplicate_design' ? (
              <span>• Destino: Cópia independente gerada na sua galeria do Canva.</span>
            ) : (
              <span>• Destino: Novas páginas adicionadas no mesmo design aberto no editor Canva.</span>
            )}
          </div>
        </div>
      </div>

      {/* Botão de Ação Primária & Interrupção */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStartGeneration}
            disabled={isRunning || (!inEditor && selectedMethod !== 'method3_duplicate_design')}
            className="flex-1 min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>PROCESSANDO ({progressCount}/{results.length || 1})...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {selectedMethod === 'method1_duplicate_page' && 'GERAR (MÉTODO 1 — DUPLICAR PÁGINA)'}
                  {selectedMethod === 'method2_reconstruct_elements' && 'GERAR (MÉTODO 2 — RECONSTRUIR PÁGINA)'}
                  {selectedMethod === 'method3_duplicate_design' && 'DUPLICAR (MÉTODO 3 — CLONE REST API)'}
                </span>
              </>
            )}
          </button>

          {isRunning && (
            <button
              type="button"
              onClick={handleInterrupt}
              className="min-h-[48px] px-3.5 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <PauseCircle className="w-4 h-4" />
              <span>PARAR</span>
            </button>
          )}
        </div>

        {!inEditor && selectedMethod !== 'method3_duplicate_design' && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              Você está na aplicação Web externa. Para executar o <strong>Método 1</strong> ou <strong>Método 2</strong>, abra o seu design no Canva e execute o aplicativo <strong>Canva Lote 2.0</strong>, ou utilize o <strong>Método 3</strong> para clonar o design diretamente pela API.
            </div>
          </div>
        )}
      </div>

      {/* Progress & Real-Time Step Label */}
      {currentStepText && (
        <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
          <span className="truncate">{currentStepText}</span>
        </div>
      )}

      {globalError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{globalError}</span>
        </div>
      )}

      {/* Resultado do Método 3: Cópia Independente via REST API */}
      {method3DesignResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 space-y-2">
          <div className="flex items-start gap-2 text-xs text-emerald-950">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">
                Cópia independente criada com sucesso na sua conta Canva!
              </div>
              <div className="text-[11px] text-emerald-800 mt-0.5">
                Design original isolado e preservado sem nenhuma modificação. ID da cópia: <code className="font-mono">{method3DesignResult.id}</code>
              </div>
            </div>
          </div>

          <div className="p-2 rounded bg-white/80 border border-emerald-100 text-[11px] text-emerald-900 leading-relaxed">
            <strong>Transparência Técnica:</strong> A Canva Connect REST API cria cópias no backend, mas não permite alterar as caixas de texto remotamente sem abrir o Canva. Para aplicar as frases do lote neste novo design, abra a cópia no Canva e execute o Canva Lote 2.0:
          </div>

          {method3DesignResult.editUrl && (
            <a
              href={method3DesignResult.editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2"
            >
              <span>Abrir Cópia Independente no Canva</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Tabela de Resultados por Página */}
      {results.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="font-bold text-slate-800">
              Progresso ({progressCount}/{results.length}) · {successCount} ok · {errorCount} erro(s)
            </span>
            <span className="font-mono-tabular font-bold text-indigo-600">{progressPct}%</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {results.map((r) => (
              <div key={r.index} className="p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="w-5 text-center font-mono-tabular text-slate-400 shrink-0">
                    {r.index}.
                  </span>
                  <div className="min-w-0">
                    <div className="text-slate-900 font-medium truncate">{r.phrase}</div>
                    {r.errorMessage && (
                      <div className="text-red-600 text-[11px] truncate">{r.errorMessage}</div>
                    )}
                    {r.pageId && (
                      <div className="text-[10px] text-slate-400 font-mono">Page ID: {r.pageId}</div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {r.status === 'pending' && (
                    <span className="text-[11px] text-slate-400">Na fila</span>
                  )}
                  {r.status === 'processing' && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  )}
                  {r.status === 'success' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Concluído
                    </span>
                  )}
                  {r.status === 'error' && (
                    <button
                      type="button"
                      onClick={handleStartGeneration}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-red-100"
                    >
                      <RefreshCw className="w-3 h-3 text-red-600" />
                      Tentar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
