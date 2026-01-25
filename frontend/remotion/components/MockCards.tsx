import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs, staggerDelay } from '../lib/animations';
import { StatusBadge } from './StatusBadge';

interface CardData {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  tags?: string[];
  color?: string;
  metrics?: Array<{ label: string; value: string }>;
}

interface MockCardsProps {
  cards: CardData[];
  delay?: number;
  title?: string;
  columns?: number;
}

export function MockCards({
  cards,
  delay = 0,
  title,
  columns = 3,
}: MockCardsProps) {
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
        gap: 24,
        padding: 32,
        opacity: containerOpacity,
        width: columns * 280 + (columns - 1) * 16 + 64, // cards + gaps + padding
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
          }}
        >
          {title}
        </h3>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 16,
        }}
      >
        {cards.map((card, i) => {
          const cardDelay = delay + staggerDelay(i, 4) / fps;
          const cardProgress = spring({
            frame: frame - cardDelay * fps,
            fps,
            config: springConfigs.snappy,
          });

          const cardScale = interpolate(cardProgress, [0, 1], [0.9, 1]);
          const cardOpacity = interpolate(cardProgress, [0, 0.5], [0, 1], {
            extrapolateRight: 'clamp',
          });
          const cardY = interpolate(cardProgress, [0, 1], [20, 0]);

          const accentColor = card.color || colors.primary;

          return (
            <div
              key={card.id}
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                border: `1px solid ${colors.border}`,
                padding: 20,
                transform: `scale(${cardScale}) translateY(${cardY}px)`,
                opacity: cardOpacity,
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: fonts.heading,
                      fontSize: 15,
                      fontWeight: 600,
                      color: colors.foreground,
                      marginBottom: 4,
                    }}
                  >
                    {card.title}
                  </div>
                  {card.subtitle && (
                    <div
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 12,
                        color: colors.mutedForeground,
                      }}
                    >
                      {card.subtitle}
                    </div>
                  )}
                </div>
                {card.status && (
                  <StatusBadge
                    status={card.status}
                    size="sm"
                    delay={cardDelay + 0.1}
                  />
                )}
              </div>

              {/* Metrics */}
              {card.metrics && card.metrics.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: card.tags ? 12 : 0,
                    paddingTop: 12,
                    borderTop: `1px solid ${colors.border}`,
                  }}
                >
                  {card.metrics.map((metric, j) => (
                    <div key={j}>
                      <div
                        style={{
                          fontFamily: fonts.mono,
                          fontSize: 16,
                          fontWeight: 600,
                          color: accentColor,
                        }}
                      >
                        {metric.value}
                      </div>
                      <div
                        style={{
                          fontFamily: fonts.body,
                          fontSize: 10,
                          color: colors.mutedForeground,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tags */}
              {card.tags && card.tags.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  {card.tags.map((tag, j) => (
                    <span
                      key={j}
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 10,
                        color: colors.mutedForeground,
                        backgroundColor: colors.muted,
                        padding: '3px 8px',
                        borderRadius: 4,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
