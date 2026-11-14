export type TabId = 'text' | 'style' | 'outline' | 'position' | 'pages' | 'export';

export type AuthConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface CanvaUser {
  userId: string;
  teamId?: string;
  displayName?: string;
}

export interface CanvaAuthStatus {
  appId: string;
  configured: boolean;
  connected: boolean;
  redirectUri: string;
  scopes: string[];
  user?: CanvaUser;
  expiresAt?: number;
  error?: string;
}

export interface CanvaDesignSummary {
  id: string;
  title: string;
  pageCount?: number;
  thumbnailUrl?: string;
  editUrl?: string;
  viewUrl?: string;
  updatedAt?: number;
  source: 'design' | 'brand_template';
}

export interface CanvaDesignPage {
  index: number; // 1-based page index
  id?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export type TextFontWeight =
  | 'normal'
  | 'thin'
  | 'extralight'
  | 'light'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'ultrabold'
  | 'heavy';

export interface TextOverlayStyle {
  fontFamily: string;
  fontSize: number; // px / pt reference (scaled proportionally in preview & PPTX)
  color: string;
  bold: boolean;
  italic: boolean;
  textAlign: 'start' | 'center' | 'end' | 'justify';
  lineHeight: number; // 0.9 .. 2.0
  boxWidthPercent: number; // 30 .. 96
  outlineEnabled: boolean;
  outlineColor: string;
  outlineWidth: number; // 1 .. 12
  positionXPercent: number; // 5 .. 95
  positionYPercent: number; // 5 .. 95
}

export const DEFAULT_SOCIAL_CAPTION_STYLE: TextOverlayStyle = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 34,
  color: '#ffffff',
  bold: true,
  italic: false,
  textAlign: 'center',
  lineHeight: 1.2,
  boxWidthPercent: 84,
  outlineEnabled: true,
  outlineColor: '#000000',
  outlineWidth: 4,
  positionXPercent: 50,
  positionYPercent: 50,
};

export type TextEntryMode = 'batch' | 'individual';

export type PageVideoStatus = 'idle' | 'loading' | 'ready' | 'static' | 'error';

export interface OverlayPageItem {
  id: string;
  pageNumber: number; // 1-based
  title: string;
  source: 'canva_design' | 'canva_editor' | 'local_video' | 'local_image';
  hasVideo: boolean;
  videoStatus: PageVideoStatus;
  videoUrl?: string; // Proxied Canva MP4 URL or local ObjectURL
  videoBlob?: Blob; // Cached MP4 bytes for PPTX / Canva Editor upload
  imageBlob?: Blob; // Cached Image bytes for PPTX / Canva Editor upload
  thumbnailUrl?: string; // Image URL or extracted video poster DataURL / ObjectURL
  width?: number;
  height?: number;
  phrase: string;
  style: TextOverlayStyle;
  editorVideoElementCount?: number;
  isLoopClone?: boolean;
  basePageNumber?: number;
  errorMessage?: string;
}

export interface BatchPhraseItem {
  id: string;
  lineNumber: number;
  text: string;
}

export interface PageExportStatus {
  pageNumber: number;
  title: string;
  phrase: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  detail?: string;
  errorMessage?: string;
}

// Legacy compatibility types for existing utility modules
export interface CanvaTextLayer {
  id: string;
  text: string;
  pageNumber: number;
  source: 'editor_sdk' | 'brand_template_field' | 'manual_keyword';
  fieldKey?: string;
  locked?: boolean;
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: TextFontWeight;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'start' | 'center' | 'end' | 'justify';
  fontRef?: string;
}

export type StyleMode = 'preserve' | 'custom';
export type EraseOriginalMode = 'inpaint' | 'solid' | 'none';

export interface RemovalVerificationReport {
  verified: boolean;
  method:
    | 'inpaint'
    | 'solid'
    | 'editor_sdk_verified'
    | 'editor_sdk_duplicate_page'
    | 'autofill_verified'
    | 'blocked';
  attempts: number;
  autoExpanded: boolean;
  finalBoxPercent: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  residualContrastRatio: number;
  summary: string;
}

export interface TextAppearanceConfig {
  mode: StyleMode;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  textAlign: 'start' | 'center' | 'end' | 'justify';
  outlineEnabled: boolean;
  outlineColor: string;
  outlineWidth: number;
  positionTop: number;
  positionLeft: number;
  positionXPercent: number;
  positionYPercent: number;
  eraseMode: EraseOriginalMode;
  eraseWidthPercent: number;
  eraseHeightPercent: number;
  enforceCleanRemoval: boolean;
  coverOriginalBg: boolean;
  coverBgColor: string;
  autoFitLongText: boolean;
}

export interface GenerationResultItem {
  id: string;
  index: number;
  phrase: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  designId?: string;
  pageNumber?: number;
  editUrl?: string;
  viewUrl?: string;
  imageDataUrl?: string;
  verification?: RemovalVerificationReport;
  errorMessage?: string;
}

export type BridgeBatchStatus = 'pending_sync' | 'syncing' | 'synced' | 'failed';

export interface CanvaBridgePageSpec {
  pageNumber: number;
  basePageNumber: number;
  phrase: string;
  style: TextOverlayStyle;
}

export interface EditorPageSafetyReport {
  pageNumber: number;
  pageType: 'absolute' | 'unsupported';
  locked: boolean;
  elementCountBefore: number;
  videoCountBefore: number;
  unsupportedElementCount: number;
  canSafelyInsert: boolean;
  reason?: string;
}

export interface EditorSafetyInspection {
  designId?: string;
  designTitle: string;
  totalPages: number;
  totalVideosBefore: number;
  supportedPagesCount: number;
  unsupportedPagesCount: number;
  lockedPagesCount: number;
  unsupportedElementsCount: number;
  hasWarnings: boolean;
  warnings: string[];
  pages: EditorPageSafetyReport[];
}

export interface BridgePageSyncReport {
  pageNumber: number;
  phrase: string;
  status: 'success' | 'error' | 'skipped';
  elementsBefore: number;
  elementsAfter: number;
  videosBefore: number;
  videosAfter: number;
  textElementVerified: boolean;
  editableVerified: boolean;
  detail?: string;
  errorMessage?: string;
}

export interface CanvaBridgeBatch {
  batchId: string;
  transferCode: string;
  designId?: string;
  designTitle: string;
  editUrl?: string;
  userId?: string;
  status: BridgeBatchStatus;
  pages: CanvaBridgePageSpec[];
  createdAt: number;
  expiresAt: number;
  syncedAt?: number;
  inspection?: EditorSafetyInspection;
  pageReports?: BridgePageSyncReport[];
  outlineSdkNote?: string;
  errorMessage?: string;
}
