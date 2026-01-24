'use client';

import { useState, useEffect, useRef } from 'react';
import { useChat } from '@/lib/use-chat';
import { TransformerProgress } from '@/components/transformer-progress';

interface ChatModalProps {
  workflowId: string;
  workflowName?: string;
}

export function ChatModal({ workflowId, workflowName }: ChatModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const chat = useChat({ workflowId });
  const modalRef = useRef<HTMLDivElement>(null);
  const connectingRef = useRef(false);

  // Connect when modal opens
  useEffect(() => {
    if (isOpen && !chat.isConnected && !chat.sessionId && !connectingRef.current) {
      connectingRef.current = true;
      chat.connect()
        .catch((err) => {
          console.error('Failed to connect chat:', err);
        })
        .finally(() => {
          connectingRef.current = false;
        });
    }
  }, [isOpen, chat.isConnected, chat.sessionId, chat.connect]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleReconnect = () => {
    chat.reset().then(() => chat.connect());
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all hover:scale-105 z-40 flex items-center justify-center"
        title="Open Chat"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal Panel */}
          <div
            ref={modalRef}
            className="relative w-full max-w-lg h-[600px] max-h-[80vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Chat</h2>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {workflowName || 'Workflow Assistant'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Connection status */}
                <div className="flex items-center gap-1.5 text-xs">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      chat.isConnected ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-muted-foreground">
                    {chat.isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                {!chat.isConnected && (
                  <button
                    onClick={handleReconnect}
                    className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    Reconnect
                  </button>
                )}

                {/* Close button */}
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="Close (Esc)"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Chat Content */}
            <div className="flex-1 overflow-auto p-4">
              {/* Welcome message when no events */}
              {chat.events.length === 0 && !chat.isTyping && (
                <div className="text-center py-8">
                  <div className="text-3xl mb-3">💬</div>
                  <h3 className="text-sm font-medium mb-1">
                    Start a conversation
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Ask questions about your workflow, create or update nodes,
                    or explore the graph.
                  </p>
                </div>
              )}

              <TransformerProgress
                events={chat.events}
                isRunning={chat.isTyping}
                error={chat.error}
                onSendMessage={chat.sendMessage}
                canSendMessage={chat.isConnected && !chat.isTyping}
                showProgressBar={false}
                showAsAccordion={false}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
