import { apiUrl, buildAuthHeaders } from './oauthClient';
import type { CanvaDesignPage, CanvaDesignSummary, CanvaTextLayer } from '../../types/canva';

interface RawCanvaDesign {
  id: string;
  title?: string;
  page_count?: number;
  thumbnail?: { url?: string; width?: number; height?: number };
  urls?: { edit_url?: string; view_url?: string };
  updated_at?: number;
}

interface RawBrandTemplate {
  id: string;
  title?: string;
  thumbnail?: { url?: string; width?: number; height?: number };
  create_url?: string;
  view_url?: string;
  updated_at?: number;
}

interface RawAutofillJobResponse {
  job?: {
    id: string;
    status: 'in_progress' | 'success' | 'failed';
    result?: {
      type: string;
      design?: RawCanvaDesign;
    };
    error?: {
      code?: string;
      message?: string;
    };
  };
}

interface RawExportJobResponse {
  job?: {
    id: string;
    status: 'in_progress' | 'success' | 'failed';
    urls?: string[];
    error?: { code?: string; message?: string };
  };
}

interface RawImportJobResponse {
  job?: {
    id: string;
    status: 'in_progress' | 'success' | 'failed';
    result?: {
      designs?: RawCanvaDesign[];
    };
    error?: { code?: string; message?: string };
  };
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      ...buildAuthHeaders(),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  const data = (await res.json()) as T & { message?: string; error?: string; code?: string };
  if (!res.ok) {
    throw new Error(
      data?.message || data?.error || `Erro da API Canva (${res.status}).`
    );
  }
  return data;
}

export function getProxiedImageUrl(rawImageUrl: string): string {
  return apiUrl(`/api/canva/proxy-image?url=${encodeURIComponent(rawImageUrl)}`);
}

export async function listUserDesigns(
  query = '',
  continuation?: string
): Promise<{ items: CanvaDesignSummary[]; continuation?: string }> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  if (continuation) params.set('continuation', continuation);
  params.set('sort_by', query.trim() ? 'relevance' : 'modified_descending');

  const data = await apiRequest<{ items?: RawCanvaDesign[]; continuation?: string }>(
    `/api/canva/designs?${params.toString()}`
  );

  const items: CanvaDesignSummary[] = (data.items || []).map((d) => ({
    id: d.id,
    title: d.title || 'Design sem título',
    pageCount: d.page_count,
    thumbnailUrl: d.thumbnail?.url,
    editUrl: d.urls?.edit_url,
    viewUrl: d.urls?.view_url,
    updatedAt: d.updated_at,
    source: 'design',
  }));

  return { items, continuation: data.continuation };
}

export async function listBrandTemplates(
  query = '',
  continuation?: string
): Promise<{ items: CanvaDesignSummary[]; continuation?: string }> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  if (continuation) params.set('continuation', continuation);

  const data = await apiRequest<{ items?: RawBrandTemplate[]; continuation?: string }>(
    `/api/canva/brand-templates?${params.toString()}`
  );

  const items: CanvaDesignSummary[] = (data.items || []).map((bt) => ({
    id: bt.id,
    title: bt.title || 'Brand Template',
    thumbnailUrl: bt.thumbnail?.url,
    editUrl: bt.create_url,
    viewUrl: bt.view_url,
    updatedAt: bt.updated_at,
    source: 'brand_template',
  }));

  return { items, continuation: data.continuation };
}

export async function getDesignPages(designId: string): Promise<CanvaDesignPage[]> {
  const data = await apiRequest<{
    items?: Array<{ index: number; thumbnail?: { url?: string; width?: number; height?: number } }>;
  }>(`/api/canva/designs/${encodeURIComponent(designId)}/pages`);

  return (data.items || []).map((p) => ({
    index: p.index,
    thumbnailUrl: p.thumbnail?.url,
    width: p.thumbnail?.width,
    height: p.thumbnail?.height,
  }));
}

export async function getBrandTemplateTextFields(
  brandTemplateId: string
): Promise<CanvaTextLayer[]> {
  const data = await apiRequest<{
    dataset?: Record<string, { type: string }>;
  }>(`/api/canva/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`);

  const dataset = data.dataset || {};
  return Object.entries(dataset)
    .filter(([, def]) => def.type === 'text')
    .map(([fieldKey], idx) => ({
      id: `bt-field-${idx}-${fieldKey}`,
      fieldKey,
      text: fieldKey,
      pageNumber: 1,
      source: 'brand_template_field' as const,
      locked: false,
    }));
}

export async function runBrandTemplateAutofill(
  brandTemplateId: string,
  fieldKey: string,
  phraseText: string,
  title: string
): Promise<{ designId: string; editUrl?: string; viewUrl?: string }> {
  const createRes = await apiRequest<RawAutofillJobResponse>('/api/canva/autofills', {
    method: 'POST',
    body: JSON.stringify({
      brand_template_id: brandTemplateId,
      title,
      data: {
        [fieldKey]: {
          type: 'text',
          text: phraseText,
        },
      },
    }),
  });

  const jobId = createRes.job?.id;
  if (!jobId) {
    throw new Error('Canva Autofill não retornou um ID de tarefa válido.');
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    const statusRes = await apiRequest<RawAutofillJobResponse>(
      `/api/canva/autofills/${encodeURIComponent(jobId)}`
    );
    const job = statusRes.job;
    if (job?.status === 'success' && job.result?.design) {
      return {
        designId: job.result.design.id,
        editUrl: job.result.design.urls?.edit_url,
        viewUrl: job.result.design.urls?.view_url,
      };
    }
    if (job?.status === 'failed') {
      throw new Error(job.error?.message || 'Autofill falhou no Canva.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Tempo limite excedido aguardando criação do design via Autofill.');
}

export async function exportDesignPageAsPng(
  designId: string,
  pageNumber: number
): Promise<string> {
  const createRes = await apiRequest<RawExportJobResponse>('/api/canva/exports', {
    method: 'POST',
    body: JSON.stringify({
      design_id: designId,
      format: {
        type: 'png',
        export_quality: 'regular',
        pages: [pageNumber],
      },
    }),
  });

  const jobId = createRes.job?.id;
  if (!jobId) {
    throw new Error('Canva Export não retornou ID de exportação.');
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    const statusRes = await apiRequest<RawExportJobResponse>(
      `/api/canva/exports/${encodeURIComponent(jobId)}`
    );
    const job = statusRes.job;
    if (job?.status === 'success' && job.urls?.[0]) {
      return job.urls[0];
    }
    if (job?.status === 'failed') {
      throw new Error(job.error?.message || 'Falha ao exportar página do Canva.');
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  throw new Error('Tempo limite excedido aguardando exportação da página no Canva.');
}

export async function importRenderedVersionToCanva(params: {
  title: string;
  backgroundJpegBase64: string;
  width: number;
  height: number;
  pages: Array<{
    lines: Array<{ text: string; widthRatio: number }>;
    fontSizePx: number;
    colorHex: string;
    bold: boolean;
    italic: boolean;
    textAlign: 'start' | 'center' | 'end' | 'justify';
    anchorXRatio: number;
    anchorYRatio: number;
    solidBox?: {
      xRatio: number;
      yRatio: number;
      wRatio: number;
      hRatio: number;
      colorHex: string;
    };
  }>;
}): Promise<{ designId: string; editUrl?: string; viewUrl?: string }> {
  const createRes = await apiRequest<RawImportJobResponse>('/api/canva/import-design', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  const jobId = createRes.job?.id;
  if (!jobId) {
    throw new Error('Canva Import não retornou ID de importação.');
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const statusRes = await apiRequest<RawImportJobResponse>(
      `/api/canva/imports/${encodeURIComponent(jobId)}`
    );
    const job = statusRes.job;
    const design = job?.result?.designs?.[0];
    if (job?.status === 'success' && design) {
      return {
        designId: design.id,
        editUrl: design.urls?.edit_url,
        viewUrl: design.urls?.view_url,
      };
    }
    if (job?.status === 'failed') {
      throw new Error(job.error?.message || 'Falha ao importar design para o Canva.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Tempo limite excedido aguardando importação editável no Canva.');
}

export function getProxiedMediaUrl(rawMediaUrl: string): string {
  return apiUrl(`/api/canva/proxy-media?url=${encodeURIComponent(rawMediaUrl)}`);
}

export async function exportDesignPageAsMp4(
  designId: string,
  pageNumber: number,
  quality:
    | 'vertical_480p'
    | 'vertical_720p'
    | 'vertical_1080p'
    | 'horizontal_720p'
    | 'horizontal_1080p' = 'vertical_720p'
): Promise<string> {
  const createRes = await apiRequest<RawExportJobResponse>('/api/canva/exports', {
    method: 'POST',
    body: JSON.stringify({
      design_id: designId,
      format: {
        type: 'mp4',
        quality,
        export_quality: 'regular',
        pages: [pageNumber],
      },
    }),
  });

  const jobId = createRes.job?.id;
  if (!jobId) {
    throw new Error('Canva Export MP4 não retornou ID de tarefa.');
  }

  for (let attempt = 0; attempt < 35; attempt++) {
    const statusRes = await apiRequest<RawExportJobResponse>(
      `/api/canva/exports/${encodeURIComponent(jobId)}`
    );
    const job = statusRes.job;
    if (job?.status === 'success' && job.urls?.[0]) {
      return job.urls[0];
    }
    if (job?.status === 'failed') {
      throw new Error(job.error?.message || 'Falha ao exportar vídeo MP4 do Canva.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  throw new Error('Tempo limite excedido aguardando exportação MP4 da página no Canva.');
}

export async function importPptxToCanva(
  title: string,
  pptxBlob: Blob
): Promise<{ designId: string; editUrl?: string; viewUrl?: string }> {
  const arrayBuffer = await pptxBlob.arrayBuffer();
  const res = await fetch(
    apiUrl(`/api/canva/import-pptx?title=${encodeURIComponent(title)}`),
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...buildAuthHeaders(),
        'Content-Type': 'application/octet-stream',
      },
      body: arrayBuffer,
    }
  );

  const createRes = (await res.json()) as RawImportJobResponse & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      createRes?.message ||
        createRes?.error ||
        `Erro ao enviar PPTX para o Canva (${res.status}).`
    );
  }

  const jobId = createRes.job?.id;
  if (!jobId) {
    throw new Error('Canva Import PPTX não retornou ID de tarefa.');
  }

  for (let attempt = 0; attempt < 35; attempt++) {
    const statusRes = await apiRequest<RawImportJobResponse>(
      `/api/canva/imports/${encodeURIComponent(jobId)}`
    );
    const job = statusRes.job;
    const design = job?.result?.designs?.[0];
    if (job?.status === 'success' && design) {
      return {
        designId: design.id,
        editUrl: design.urls?.edit_url,
        viewUrl: design.urls?.view_url,
      };
    }
    if (job?.status === 'failed') {
      throw new Error(job.error?.message || 'Falha ao converter PPTX em design editável no Canva.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Tempo limite excedido aguardando criação do design editável no Canva.');
}

export async function copyCanvaDesignRest(
  designId: string,
  title?: string
): Promise<{
  id: string;
  title: string;
  editUrl?: string;
  viewUrl?: string;
}> {
  // Official Canva Connect REST API format for duplicating designs
  const payload = {
    design_type: {
      type: 'design',
      design_id: designId,
    },
    ...(title ? { title } : {}),
  };

  const res = await apiRequest<{
    design?: RawCanvaDesign;
  }>('/api/canva/designs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const design = res.design;
  if (!design || !design.id) {
    throw new Error('A API do Canva não retornou os metadados do design copiado.');
  }

  return {
    id: design.id,
    title: design.title || title || 'Cópia de Design',
    editUrl: design.urls?.edit_url,
    viewUrl: design.urls?.view_url,
  };
}
