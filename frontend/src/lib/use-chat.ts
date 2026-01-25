'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TransformerEvent } from '@/components/transformer-progress';
import type {
  CreateChatSessionRequest,
  CreateChatSessionResponse,
} from '@/types/chat';

interface UseChatOptions {
  workflowId: string;
  systemPrompt?: string;
  tools?: string[];
  autoConnect?: boolean;
}

interface UseChatReturn {
  /** Session ID (available after connect) */
  sessionId: string | null;
  /** All events received in this session */
  events: TransformerEvent[];
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Whether agent is currently responding */
  isTyping: boolean;
  /** Error message if any */
  error: string | null;
  /** Connect to create session and open WebSocket */
  connect: () => Promise<void>;
  /** Send a message to the agent */
  sendMessage: (message: string) => void;
  /** Disconnect and optionally close session */
  disconnect: (closeSession?: boolean) => Promise<void>;
  /** Reset state (disconnect + clear events) */
  reset: () => Promise<void>;
}

/**
 * Get backend URL from environment or calculate from frontend port.
 */
function getBackendUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:8000';
  }

  let backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    const frontendPort = parseInt(window.location.port || '3000', 10);
    const backendPort = frontendPort === 3000 ? 8000 : frontendPort - 1;
    backendUrl = `http://${window.location.hostname}:${backendPort}`;
  }
  return backendUrl;
}

/**
 * Get WebSocket URL from backend URL.
 */
function getWebSocketUrl(backendUrl: string): string {
  return backendUrl.replace(/^http/, 'ws');
}

/**
 * Hook for multi-turn chat via WebSocket.
 *
 * @example
 * ```tsx
 * const chat = useChat({ workflowId: 'workflow-123' });
 *
 * useEffect(() => {
 *   chat.connect();
 *   return () => chat.disconnect();
 * }, []);
 *
 * <TransformerProgress
 *   events={chat.events}
 *   isRunning={chat.isTyping}
 *   error={chat.error}
 *   onSendMessage={chat.sendMessage}
 *   canSendMessage={chat.isConnected && !chat.isTyping}
 * />
 * ```
 */
export function useChat(options: UseChatOptions): UseChatReturn {
  const { workflowId, systemPrompt, tools, autoConnect = false } = options;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<TransformerEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  /**
   * Create a chat session via REST API.
   */
  const createSession = useCallback(async (): Promise<string> => {
    const backendUrl = getBackendUrl();
    const url = `${backendUrl}/api/v1/workflows/${workflowId}/chat/sessions`;

    const body: CreateChatSessionRequest = {};
    if (systemPrompt) body.system_prompt = systemPrompt;
    if (tools) body.tools = tools;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create session: ${response.status} ${text}`);
    }

    const data: CreateChatSessionResponse = await response.json();
    return data.session_id;
  }, [workflowId, systemPrompt, tools]);

  /**
   * Close a chat session via REST API.
   */
  const closeSessionApi = useCallback(async (sid: string): Promise<void> => {
    const backendUrl = getBackendUrl();
    const url = `${backendUrl}/api/v1/workflows/${workflowId}/chat/sessions/${sid}`;

    try {
      await fetch(url, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to close session:', err);
    }
  }, [workflowId]);

  /**
   * Connect to create session and open WebSocket.
   */
  const connect = useCallback(async () => {
    // Disconnect any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setError(null);
    setEvents([]);
    setIsConnected(false);
    setIsTyping(false);

    try {
      // Create session
      const sid = await createSession();
      setSessionId(sid);
      sessionIdRef.current = sid;

      // Connect WebSocket
      const backendUrl = getBackendUrl();
      const wsUrl = getWebSocketUrl(backendUrl);
      const ws = new WebSocket(
        `${wsUrl}/api/v1/workflows/${workflowId}/chat/ws/${sid}`
      );

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TransformerEvent;
          setEvents((prev) => [...prev, data]);

          // Track typing state
          if (data.event === 'message_complete') {
            setIsTyping(false);
          } else if (data.event === 'error') {
            setIsTyping(false);
            setError((data.message as string) || 'Unknown error');
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
        setIsConnected(false);
        setIsTyping(false);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setIsTyping(false);
        if (event.code !== 1000 && event.code !== 1005) {
          // Abnormal close
          setError(`Connection closed: ${event.reason || event.code}`);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      throw err;
    }
  }, [workflowId, createSession]);

  /**
   * Send a message to the agent.
   */
  const sendMessage = useCallback((message: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected');
      return;
    }

    if (isTyping) {
      setError('Agent is still responding');
      return;
    }

    // Add user message to events
    setEvents((prev) => [
      ...prev,
      { event: 'user_message', text: message },
    ]);

    setIsTyping(true);
    setError(null);

    wsRef.current.send(JSON.stringify({ message }));
  }, [isTyping]);

  /**
   * Disconnect and optionally close session.
   */
  const disconnect = useCallback(async (closeSession = true) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsTyping(false);

    if (closeSession && sessionIdRef.current) {
      await closeSessionApi(sessionIdRef.current);
    }

    setSessionId(null);
    sessionIdRef.current = null;
  }, [closeSessionApi]);

  /**
   * Reset state (disconnect + clear events).
   */
  const reset = useCallback(async () => {
    await disconnect(true);
    setEvents([]);
    setError(null);
  }, [disconnect]);

  // Auto-connect on mount if requested
  useEffect(() => {
    if (autoConnect) {
      connect().catch((err) => {
        console.error('Auto-connect failed:', err);
      });
    }

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [autoConnect, connect]);

  return {
    sessionId,
    events,
    isConnected,
    isTyping,
    error,
    connect,
    sendMessage,
    disconnect,
    reset,
  };
}
