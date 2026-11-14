import React, { useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileUp,
  ListOrdered,
  Trash2,
  Type,
} from 'lucide-react';
import { BatchLinesTextarea } from '../../components/BatchLinesTextarea';
import { parseImportedFileText } from '../../services/phraseProcessor';
import type { OverlayPageItem, TextEntryMode } from '../../types/canva';

interface OverlayTextTabProps {
  pages: OverlayPageItem[];
  activePageIndex: number;
  onSelectPageIndex: (idx: number) => void;
  textEntryMode: TextEntryMode;
  onChangeTextEntryMode: (mode: TextEntryMode) => void;
  batchText: string;
  onChangeBatchText: (raw: string) => void;
  onUpdatePagePhrase: (pageIndex: number, phrase: string) => void;
  onApplyPhraseToAllPages: (phrase: string) => void;
  onGoToPagesTab: () => void;
}

export const OverlayTextTab: React.FC<OverlayTextTabProps> = ({
  pages,
  activePageIndex,
  onSelectPageIndex,
  textEntryMode,
  onChangeTextEntryMode,
  batchText,
  onChangeBatchText,
  onUpdatePagePhrase,
  onApplyPhraseToAllPages,
  onGoToPagesTab,
}) => {
  const activePage = pages[activePageIndex] || null;
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const lines = batchText.replace(/\r\n/g, '\n').split('\n');
  const nonEmptyLinesCount = lines.filter((l) => l.trim().length > 0).length;
  const baseCount = pages.filter((p) => !p.isLoopClone).length;
  const loopCount = pages.filter((p) => p.isLoopClone).length;

  const handleImportFile = async (file: File) => {
    const content = await file.text();
    const parsed = parseImportedFileText(content, file.name);
    onChangeTextEntryMode('batch');
    onChangeBatchText(parsed);
    const count = parsed
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean).length;
    setFeedback(
      `${count} frase(s) importada(s) de ${file.name} e aplicadas às páginas.`
    );
  };

  return (
    <div className="space-y-3.5">
      {/* Mode Choice Buttons: Texto em Lote (Padrão) vs Texto Individual */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 block">
          Modo de edição de texto
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeTextEntryMode('batch')}
            aria-pressed={textEntryMode === 'batch'}
            className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              textEntryMode === 'batch'
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ListOrdered className="w-4 h-4 shrink-0" />
            <span>Texto em Lote</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTextEntryMode('individual')}
            aria-pressed={textEntryMode === 'individual'}
            className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              textEntryMode === 'individual'
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Type className="w-4 h-4 shrink-0" />
            <span>Texto Individual</span>
          </button>
        </div>
      </div>

      {/* MODE 1 (DEFAULT): Texto em Lote — 1 linha por página em tempo real */}
      {textEntryMode === 'batch' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <label
                htmlFor="batch-lines-textarea"
                className="text-xs font-semibold text-slate-800 block"
              >
                Frases em lote (1 linha = 1 página)
              </label>
              <p className="text-[11px] text-slate-500">
                Cole ou edite várias frases confortavelmente — altura automática com rolagem interna.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  void handleImportFile(f);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="min-h-[40px] px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>TXT / CSV</span>
            </button>
          </div>

          <BatchLinesTextarea
            id="batch-lines-textarea"
            value={batchText}
            onChange={onChangeBatchText}
            minHeightPx={195}
            maxHeightViewportRatio={0.40}
            placeholder={
              'Linha 1 vai para Página 1\nLinha 2 vai para Página 2\nLinha 3 vai para Página 3\nLinha 4 repete o vídeo da Página 1 em loop...'
            }
          />

          <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
            <span className="font-mono-tabular tabular-nums">
              {nonEmptyLinesCount} frase(s) · {baseCount} pág. base
              {loopCount > 0 ? ` + ${loopCount} repetida(s) em loop` : ''}
            </span>
            {batchText && (
              <button
                type="button"
                onClick={() => onChangeBatchText('')}
                className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}
          </div>

          {pages.length === 0 && (
            <button
              type="button"
              onClick={onGoToPagesTab}
              className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              Carregar vídeos ou imagens na aba Páginas
            </button>
          )}
        </div>
      )}

      {/* MODE 2: Texto Individual — edita somente a página ativa */}
      {textEntryMode === 'individual' && (
        <div className="space-y-3">
          {!activePage ? (
            <div className="py-5 text-center space-y-2.5">
              <p className="text-xs text-slate-500">
                Carregue um vídeo, imagem ou design do Canva para editar individualmente cada página.
              </p>
              <button
                type="button"
                onClick={onGoToPagesTab}
                className="min-h-[44px] px-4 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
              >
                Ir para Páginas
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="active-page-phrase"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-700"
                >
                  Frase da Página {activePage.pageNumber} de {pages.length}
                </label>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pages.length <= 1}
                    onClick={() =>
                      onSelectPageIndex(
                        activePageIndex > 0 ? activePageIndex - 1 : pages.length - 1
                      )
                    }
                    aria-label="Página anterior"
                    className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-35 flex items-center justify-center cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={pages.length <= 1}
                    onClick={() =>
                      onSelectPageIndex(
                        activePageIndex + 1 < pages.length ? activePageIndex + 1 : 0
                      )
                    }
                    aria-label="Próxima página"
                    className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-35 flex items-center justify-center cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <textarea
                id="active-page-phrase"
                rows={4}
                value={activePage.phrase}
                onChange={(e) => onUpdatePagePhrase(activePageIndex, e.target.value)}
                placeholder={`Digite a frase somente para a Página ${activePage.pageNumber}...`}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none resize-y"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!activePage.phrase.trim() || pages.length <= 1}
                  onClick={() => {
                    onApplyPhraseToAllPages(activePage.phrase);
                    setFeedback(
                      `Frase replicada em todas as ${pages.length} páginas.`
                    );
                  }}
                  className="min-h-[44px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-45 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Usar em todas ({pages.length})</span>
                </button>

                {activePage.phrase && (
                  <button
                    type="button"
                    onClick={() => onUpdatePagePhrase(activePageIndex, '')}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {feedback && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
    </div>
  );
};
