export const CANVA_APP_CONFIG = {
  appId: 'AAHOGGtX324',
  appName: 'Canva Lote 2.0',
  intent: 'design_editor' as const,
} as const;

/**
 * Checks whether the Canva Design SDK global runtime (`window.canva_sdk.design`)
 * has been injected by Canva's Design Editor host iframe.
 */
export function isCanvaEditorHost(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const win = window as unknown as {
      canva_sdk?: { design?: { v2?: unknown } };
    };
    return Boolean(win.canva_sdk?.design?.v2);
  } catch {
    return false;
  }
}
