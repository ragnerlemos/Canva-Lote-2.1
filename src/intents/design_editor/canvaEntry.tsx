import { prepareDesignEditor } from '@canva/intents/design';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import '../../styles/index.css';

declare global {
  interface Window {
    __CANVA_LOTE_CSS__?: string;
    __CANVA_LOTE_BACKEND_URL__?: string;
  }
}

function injectBundledStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('canva-lote-bundled-css')) return;

  // Inject Google Fonts for clean typography inside Canva iframe
  if (!document.getElementById('canva-lote-fonts')) {
    const fontLink = document.createElement('link');
    fontLink.id = 'canva-lote-fonts';
    fontLink.rel = 'stylesheet';
    fontLink.href =
      'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(fontLink);
  }

  if (window.__CANVA_LOTE_CSS__) {
    const style = document.createElement('style');
    style.id = 'canva-lote-bundled-css';
    style.textContent = window.__CANVA_LOTE_CSS__;
    document.head.appendChild(style);
  }
}

async function render() {
  injectBundledStyles();
  let rootEl = document.getElementById('root');
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.id = 'root';
    document.body.appendChild(rootEl);
  }

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

prepareDesignEditor({ render });
