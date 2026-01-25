import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs } from '../lib/animations';
import { TypewriterText } from './TypewriterText';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  delay: number; // seconds from scene start
}

interface MockChatProps {
  messages: ChatMessage[];
  delay?: number;
  title?: string;
}

export function MockChat({ messages, delay = 0, title }: MockChatProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerProgress = spring({
    frame: frame - delay * fps,
    fps,
    config: springConfigs.smooth,
  });

  const containerOpacity = interpolate(containerProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 32,
        maxWidth: 600,
        opacity: containerOpacity,
      }}
    >
      {title && (
        <h3
          style={{
            fontFamily: fonts.heading,
            fontSize: 24,
            fontWeight: 600,
            color: colors.foreground,
            margin: 0,
            marginBottom: 8,
          }}
        >
          {title}
        </h3>
      )}

      <div
        style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          border: `1px solid ${colors.border}`,
          overflow: 'hidden',
        }}
      >
        {/* Chat header */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: colors.success,
            }}
          />
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: 12,
              color: colors.mutedForeground,
            }}
          >
            Chat with your workflow
          </span>
        </div>

        {/* Messages */}
        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {messages.map((message) => {
            const messageDelay = delay + message.delay;
            const messageProgress = spring({
              frame: frame - messageDelay * fps,
              fps,
              config: springConfigs.snappy,
            });

            const messageScale = interpolate(messageProgress, [0, 1], [0.9, 1]);
            const messageOpacity = interpolate(
              messageProgress,
              [0, 0.5],
              [0, 1],
              { extrapolateRight: 'clamp' }
            );
            const messageY = interpolate(messageProgress, [0, 1], [10, 0]);

            const isUser = message.role === 'user';

            return (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  transform: `scale(${messageScale}) translateY(${messageY}px)`,
                  opacity: messageOpacity,
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    backgroundColor: isUser ? colors.primary : colors.muted,
                    border: isUser ? 'none' : `1px solid ${colors.border}`,
                  }}
                >
                  {isUser ? (
                    <span
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 14,
                        color: colors.background,
                      }}
                    >
                      {message.content}
                    </span>
                  ) : (
                    <TypewriterText
                      text={message.content}
                      delay={messageDelay + 0.2}
                      speed={60}
                      showCursor={false}
                      style={{
                        fontSize: 14,
                        color: colors.foreground,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input field (static) */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.muted,
          }}
        >
          <div
            style={{
              backgroundColor: colors.input,
              borderRadius: 8,
              padding: '10px 16px',
              border: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: 13,
                color: colors.mutedForeground,
              }}
            >
              Ask about your workflow...
            </span>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: colors.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.background}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
