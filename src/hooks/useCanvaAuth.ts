import { useCallback, useEffect, useState } from 'react';
import {
  disconnectCanvaSession,
  fetchCanvaAuthStatus,
  fetchCanvaAuthUrl,
  setStoredSessionToken,
} from '../integrations/canva/oauthClient';
import type { AuthConnectionState, CanvaAuthStatus } from '../types/canva';

export function useCanvaAuth() {
  const [status, setStatus] = useState<CanvaAuthStatus | null>(null);
  const [connectionState, setConnectionState] =
    useState<AuthConnectionState>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchCanvaAuthStatus();
      setStatus(data);
      if (data.connected) {
        setConnectionState('connected');
        setErrorMessage(null);
      } else if (data.error) {
        setConnectionState('error');
        setErrorMessage(data.error);
      } else {
        setConnectionState('disconnected');
        setErrorMessage(null);
      }
    } catch (err) {
      setConnectionState('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao consultar conexão com o Canva.'
      );
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      const isTrusted =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost');
      if (!isTrusted) return;

      const payload = event.data as
        | { type?: string; sessionToken?: string; error?: string }
        | undefined;
      if (!payload?.type) return;

      if (payload.type === 'CANVA_OAUTH_SUCCESS') {
        if (payload.sessionToken) {
          setStoredSessionToken(payload.sessionToken);
        }
        void refreshStatus();
      } else if (payload.type === 'CANVA_OAUTH_ERROR') {
        setConnectionState('error');
        setErrorMessage(payload.error || 'Autorização cancelada ou recusada no Canva.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refreshStatus]);

  const connect = useCallback(async () => {
    setConnectionState('connecting');
    setErrorMessage(null);
    try {
      const { url } = await fetchCanvaAuthUrl();
      const popup = window.open(
        url,
        'canva_oauth_popup',
        'width=520,height=680,menubar=no,toolbar=no,status=no'
      );

      if (!popup) {
        setConnectionState('error');
        setErrorMessage(
          'Pop-up bloqueado pelo navegador. Permita pop-ups para conectar sua conta Canva.'
        );
        return;
      }

      // Detect if user manually closed popup before completing OAuth
      const pollTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollTimer);
          setConnectionState((prev) => (prev === 'connecting' ? 'disconnected' : prev));
        }
      }, 600);
    } catch (err) {
      setConnectionState('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Não foi possível iniciar o OAuth do Canva.'
      );
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectCanvaSession();
    setConnectionState('disconnected');
    setErrorMessage(null);
    await refreshStatus();
  }, [refreshStatus]);

  return {
    status,
    connectionState,
    errorMessage,
    connect,
    disconnect,
    refreshStatus,
  };
}
