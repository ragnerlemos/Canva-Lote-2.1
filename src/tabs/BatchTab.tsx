import React, { useRef, useState } from 'react';
import { FileUp, Pencil, Trash2, Check, Sparkles } from 'lucide-react';
import {
  analyzePhrases,
  parseImportedFileText,
  removeEmptyLines,
} from '../services/phraseProcessor';

interface BatchTabProps {
  rawPhrasesText: string;
  onChangeRawPhrasesText: (next: string) => void;
  onGoToGenerateTab: () => void;
}

export const BatchTab: React.FC<BatchTabProps> = ({
  rawPhrasesText,
  onChangeRawPhrasesText,
  onGoToGenerateTab,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'editor' | 'list'>('editor');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  const analysis = analyzePhrases(rawPhrasesText);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
      if (!text) return;
      const parsed = parseImportedFileText(text, file.name);
      onChangeRawPhrasesText(
        rawPhrasesText.trim() ? `${rawPhrasesText.trim()}\n${parsed}` : parsed
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeletePhrase = (targetIdx: number) => {
    const nextList = analysis.validPhrases
      .filter((_, idx) => idx !== targetIdx)
      .map((p) => p.text);
    onChangeRawPhrasesText(nextList.join('\n'));
  };

  const handleStartEdit = (idx: number, currentText: string) => {
    setEditingIndex(idx);
    setEditingDraft(currentText);
  };

  const handleSaveEdit = (idx: number) => {
    const nextList = analysis.validPhrases.map((p, i) =>
      i === idx ? editingDraft.trim() : p.text
    );
    onChangeRawPhrasesText(nextList.filter(Boolean).join('\n'));
    setEditingIndex(null);
    setEditingDraft('');
  };

  return (
    <div className="py-3 space-y-3">
      {/* Top Counter & View Switch */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900">
            03 — Lista de Frases
          </h1>
          <p className="text-xs text-slate-500 font-mono-tabular">
            {analysis.validPhrases.length}{' '}
            {analysis.validPhrases.length === 1 ? 'frase válida' : 'frases válidas'}
            {analysis.emptyLinesCount > 0
              ? ` · ${analysis.emptyLinesCount} vazias`
              : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-200/70 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('editor')}
            className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
              viewMode === 'editor'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Colar texto
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Editar itens
          </button>
        </div>
      </div>

      {/* Action Strip Right Above Input */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.csv"
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
        >
          <FileUp className="w-3.5 h-3.5 text-indigo-600" />
          <span>Importar TXT / CSV</span>
        </button>

        {analysis.emptyLinesCount > 0 && (
          <button
            type="button"
            onClick={() => onChangeRawPhrasesText(removeEmptyLines(rawPhrasesText))}
            className="min-h-[40px] px-3 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Remover {analysis.emptyLinesCount} vazias</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onChangeRawPhrasesText('')}
          disabled={!rawPhrasesText}
          className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-red-50 text-xs font-semibold text-red-600 disabled:opacity-40 ml-auto cursor-pointer"
        >
          Limpar
        </button>
      </div>

      {/* Input Area or Individual Item Editor */}
      {viewMode === 'editor' ? (
        <textarea
          value={rawPhrasesText}
          onChange={(e) => onChangeRawPhrasesText(e.target.value)}
          placeholder={`Cole suas frases aqui (uma por linha):\n\nA vida é maravilhosa.\nNunca desista dos seus sonhos.\nTudo acontece no tempo certo.`}
          className="w-full min-h-[260px] sm:min-h-[320px] p-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 leading-relaxed resize-y"
        />
      ) : analysis.validPhrases.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
          Nenhuma frase na lista ainda. Volte para "Colar texto" ou importe um arquivo TXT/CSV.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white max-h-[360px] overflow-y-auto">
          {analysis.validPhrases.map((item, idx) => (
            <div
              key={item.id}
              className="px-3 py-2 flex items-center justify-between gap-2"
            >
              <span className="text-xs font-mono-tabular text-slate-400 w-7 shrink-0">
                {idx + 1}.
              </span>

              {editingIndex === idx ? (
                <div className="flex-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    className="flex-1 min-h-[38px] px-2.5 rounded-lg border border-indigo-500 text-sm text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(idx)}
                    aria-label="Salvar frase"
                    className="min-h-[38px] min-w-[38px] rounded-lg bg-indigo-600 text-white flex items-center justify-center cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm text-slate-800 break-words">
                    {item.text}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(idx, item.text)}
                      aria-label="Editar frase"
                      className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePhrase(idx)}
                      aria-label="Remover frase"
                      className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-red-50 text-red-500 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onGoToGenerateTab}
        disabled={analysis.validPhrases.length === 0}
        className="w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-semibold transition cursor-pointer"
      >
        Revisar e Gerar ({analysis.validPhrases.length}{' '}
        {analysis.validPhrases.length === 1 ? 'versão' : 'versões'})
      </button>
    </div>
  );
};
