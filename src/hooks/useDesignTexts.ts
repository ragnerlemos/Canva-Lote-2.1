import { useCallback, useEffect, useState } from 'react';
import { readActiveEditorTexts } from '../integrations/canva/designSdkClient';
import { getBrandTemplateTextFields } from '../integrations/canva/restApiClient';
import { isCanvaEditorHost } from '../intents/design_editor';
import type { CanvaDesignSummary, CanvaTextLayer } from '../types/canva';

export function useDesignTexts(
  selectedDesign: CanvaDesignSummary | null,
  selectedPageNumber: number
) {
  const [textLayers, setTextLayers] = useState<CanvaTextLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [manualTargetText, setManualTargetText] = useState<string>('(frase)');
  const [isLoading, setIsLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [editorAvailable, setEditorAvailable] = useState(false);

  const loadTexts = useCallback(async () => {
    setIsLoading(true);
    setInfoMessage(null);

    try {
      // 1. If running inside Canva Design Editor, read real elements via @canva/design
      if (isCanvaEditorHost()) {
        const snapshot = await readActiveEditorTexts(selectedPageNumber);
        setEditorAvailable(snapshot.available);
        if (snapshot.available) {
          setTextLayers(snapshot.textLayers);
          if (snapshot.textLayers.length > 0) {
            setSelectedLayerId((prev) =>
              snapshot.textLayers.some((l) => l.id === prev)
                ? prev
                : snapshot.textLayers[0].id
            );
          } else {
            setInfoMessage(
              `Nenhuma camada de texto encontrada na página ${selectedPageNumber} do design aberto.`
            );
          }
          setIsLoading(false);
          return;
        }
        if (snapshot.error) {
          setInfoMessage(snapshot.error);
        }
      } else {
        setEditorAvailable(false);
      }

      // 2. If a Brand Template is selected via REST API, inspect its real Autofill dataset fields
      if (selectedDesign?.source === 'brand_template') {
        const fields = await getBrandTemplateTextFields(selectedDesign.id);
        setTextLayers(fields);
        if (fields.length > 0) {
          setSelectedLayerId(fields[0].id);
        } else {
          setInfoMessage(
            'Este Brand Template não possui campos de texto marcados para Autofill no Canva.'
          );
        }
        setIsLoading(false);
        return;
      }

      // 3. Regular design selected via REST API outside Canva Editor -> Enable Web Canvas Compose target
      if (selectedDesign) {
        const manualId = `manual-${selectedDesign.id}-p${selectedPageNumber}`;
        const manualLayer: CanvaTextLayer = {
          id: manualId,
          text: manualTargetText || '(frase)',
          pageNumber: selectedPageNumber,
          source: 'manual_keyword',
          fontSize: 32,
          color: '#facc15',
          fontWeight: 'bold',
          textAlign: 'center',
        };
        setTextLayers([manualLayer]);
        setSelectedLayerId(manualId);
        setInfoMessage(
          'Modo Edição em Lote Web ativo: posicione o texto na prévia abaixo, configure estilo/contorno e gere todas as imagens (com importação opcional em PDF para sua conta Canva).'
        );
      } else {
        setTextLayers([]);
        setSelectedLayerId(null);
        setInfoMessage(
          'Selecione um design na aba Template (ou abra este app dentro do Editor do Canva) para configurar o texto alvo.'
        );
      }
    } catch (err) {
      setInfoMessage(
        err instanceof Error ? err.message : 'Erro ao inspecionar textos do design.'
      );
      setTextLayers([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDesign, selectedPageNumber]);

  useEffect(() => {
    void loadTexts();
  }, [loadTexts]);

  const updateManualTargetText = useCallback((nextText: string) => {
    setManualTargetText(nextText);
    setTextLayers((prev) =>
      prev.map((layer) =>
        layer.source === 'manual_keyword'
          ? { ...layer, text: nextText }
          : layer
      )
    );
  }, []);

  const selectedLayer = textLayers.find((l) => l.id === selectedLayerId) || null;

  return {
    textLayers,
    selectedLayer,
    selectedLayerId,
    setSelectedLayerId,
    manualTargetText,
    updateManualTargetText,
    isLoading,
    infoMessage,
    editorAvailable,
    reloadTexts: loadTexts,
  };
}
