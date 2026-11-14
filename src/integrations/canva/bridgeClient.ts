import type {
  BridgePageSyncReport,
  CanvaBridgeBatch,
  CanvaBridgePageSpec,
  EditorSafetyInspection,
} from '../../types/canva';
import { apiUrl, buildAuthHeaders } from './oauthClient';

export interface BridgeBatchCandidate {
  batchId: string;
  transferCode: string;
  designId?: string;
  designTitle: string;
  status: CanvaBridgeBatch['status'];
  pageCount: number;
  createdAt: number;
}

export async function createBridgeBatch(params: {
  designId?: string;
  designTitle: string;
  editUrl?: string;
  pages: CanvaBridgePageSpec[];
}): Promise<CanvaBridgeBatch> {
  const res = await fetch(apiUrl('/api/canva/bridge/batches'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...buildAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { batch?: CanvaBridgeBatch; message?: string; error?: string };
  if (!res.ok || !data.batch) {
    throw new Error(
      data.message || data.error || 'Não foi possível criar o lote de transferência para o Canva.'
    );
  }
  return data.batch;
}

export async function getBridgeBatchStatus(batchId: string): Promise<CanvaBridgeBatch> {
  const res = await fetch(apiUrl(`/api/canva/bridge/batches/${encodeURIComponent(batchId)}`), {
    credentials: 'include',
    headers: buildAuthHeaders(),
  });
  const data = (await res.json()) as { batch?: CanvaBridgeBatch; message?: string; error?: string };
  if (!res.ok || !data.batch) {
    throw new Error(data.message || data.error || 'Lote de transferência não encontrado.');
  }
  return data.batch;
}

export async function lookupBridgeBatch(params: {
  code?: string;
  designId?: string;
  title?: string;
  includeRecent?: boolean;
}): Promise<{ batch: CanvaBridgeBatch | null; candidates: BridgeBatchCandidate[] }> {
  const qs = new URLSearchParams();
  if (params.code?.trim()) qs.set('code', params.code.trim());
  if (params.designId?.trim()) qs.set('designId', params.designId.trim());
  if (params.title?.trim()) qs.set('title', params.title.trim());
  if (params.includeRecent) qs.set('includeRecent', '1');

  const res = await fetch(apiUrl(`/api/canva/bridge/batches/lookup?${qs.toString()}`), {
    headers: buildAuthHeaders(),
  });
  const data = (await res.json()) as {
    batch?: CanvaBridgeBatch | null;
    candidates?: BridgeBatchCandidate[];
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message || 'Erro ao buscar lote pendente no servidor.');
  }
  return {
    batch: data.batch || null,
    candidates: data.candidates || [],
  };
}

export async function reportBridgeInspection(
  batchId: string,
  inspection: EditorSafetyInspection
): Promise<CanvaBridgeBatch> {
  const res = await fetch(
    apiUrl(`/api/canva/bridge/batches/${encodeURIComponent(batchId)}/inspect`),
    {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inspection }),
    }
  );
  const data = (await res.json()) as { batch?: CanvaBridgeBatch; message?: string };
  if (!res.ok || !data.batch) {
    throw new Error(data.message || 'Erro ao registrar inspeção de segurança.');
  }
  return data.batch;
}

export async function reportBridgeSyncResult(
  batchId: string,
  payload: {
    status: CanvaBridgeBatch['status'];
    inspection?: EditorSafetyInspection;
    pageReports?: BridgePageSyncReport[];
    outlineSdkNote?: string;
    errorMessage?: string;
  }
): Promise<CanvaBridgeBatch> {
  const res = await fetch(
    apiUrl(`/api/canva/bridge/batches/${encodeURIComponent(batchId)}/status`),
    {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  const data = (await res.json()) as { batch?: CanvaBridgeBatch; message?: string };
  if (!res.ok || !data.batch) {
    throw new Error(data.message || 'Erro ao enviar confirmação de sincronização.');
  }
  return data.batch;
}
