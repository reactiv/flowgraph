'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useChat } from '@/lib/use-chat';
import { TransformerProgress } from '@/components/transformer-progress';

export default function WorkflowChatPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  // Fetch workflow for title and validation
  const {
    data: workflow,
    isLoading: workflowLoading,
    error: workflowError,
  } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
  });

  // Chat hook
  const chat = useChat({ workflowId });

  // Connect on mount
  useEffect(() => {
    chat.connect().catch((err) => {
      console.error('Failed to connect:', err);
    });

    return () => {
      chat.disconnect(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  const handleBack = useCallback(() => {
    router.push(`/workflows/${workflowId}`);
  }, [router, workflowId]);

  const handleReconnect = useCallback(() => {
    chat.reset().then(() => chat.connect());
  }, [chat]);

  if (workflowLoading) {
    return (
      <div className="container max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (workflowError || !workflow) {
    return (
      <div className="container max-w-4xl mx-auto p-6">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          Failed to load workflow: {workflowError?.message || 'Not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-semibold">{workflow.name}</h1>
              <p className="text-sm text-muted-foreground">
                Chat with your workflow data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Connection status */}
            <div className="flex items-center gap-2 text-sm">
              <div
                className={`w-2 h-2 rounded-full ${
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
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Welcome message when no events */}
          {chat.events.length === 0 && !chat.isTyping && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">💬</div>
              <h2 className="text-lg font-medium mb-2">
                Start a conversation
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Ask questions about your workflow data, create or update nodes,
                or explore relationships in the graph.
              </p>
              <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                <p className="font-medium">Try asking:</p>
                <ul className="space-y-1">
                  <li>&quot;List all nodes in this workflow&quot;</li>
                  <li>&quot;Find nodes with status pending&quot;</li>
                  <li>&quot;Create a new Sample node&quot;</li>
                  <li>&quot;Show me the graph structure&quot;</li>
                </ul>
              </div>
            </div>
          )}

          {/* Chat progress/events */}
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
  );
}
