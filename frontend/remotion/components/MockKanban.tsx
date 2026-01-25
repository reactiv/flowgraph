import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs, staggerDelay } from '../lib/animations';
import { StatusBadge } from './StatusBadge';

interface KanbanColumn {
  title: string;
  color: string;
  cards: Array<{
    title: string;
    subtitle?: string;
    status?: string;
  }>;
}

interface MockKanbanProps {
  columns: KanbanColumn[];
  delay?: number;
  title?: string;
}

export function MockKanban({ columns, delay = 0, title }: MockKanbanProps) {
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
        width: columns.length * 260 + 60, // 240px per column + 20px gap + padding
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
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        {columns.map((column, colIndex) => {
          const colDelay = delay + staggerDelay(colIndex, 3) / fps;
          const colProgress = spring({
            frame: frame - colDelay * fps,
            fps,
            config: springConfigs.snappy,
          });

          const colY = interpolate(colProgress, [0, 1], [30, 0]);
          const colOpacity = interpolate(colProgress, [0, 0.5], [0, 1], {
            extrapolateRight: 'clamp',
          });

          return (
            <div
              key={colIndex}
              style={{
                width: 240,
                backgroundColor: colors.card,
                borderRadius: 12,
                border: `1px solid ${colors.border}`,
                overflow: 'hidden',
                transform: `translateY(${colY}px)`,
                opacity: colOpacity,
              }}
            >
              {/* Column header */}
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: `2px solid ${column.color}`,
                  backgroundColor: `${column.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.heading,
                    fontSize: 14,
                    fontWeight: 600,
                    color: colors.foreground,
                  }}
                >
                  {column.title}
                </span>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    fontWeight: 500,
                    color: column.color,
                    backgroundColor: `${column.color}20`,
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}
                >
                  {column.cards.length}
                </span>
              </div>

              {/* Cards */}
              <div
                style={{
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {column.cards.map((card, cardIndex) => {
                  const cardDelay =
                    colDelay + staggerDelay(cardIndex, 4) / fps + 0.1;
                  const cardProgress = spring({
                    frame: frame - cardDelay * fps,
                    fps,
                    config: springConfigs.snappy,
                  });

                  const cardScale = interpolate(cardProgress, [0, 1], [0.9, 1]);
                  const cardOpacity = interpolate(
                    cardProgress,
                    [0, 0.5],
                    [0, 1],
                    { extrapolateRight: 'clamp' }
                  );

                  return (
                    <div
                      key={cardIndex}
                      style={{
                        backgroundColor: colors.muted,
                        borderRadius: 8,
                        padding: 12,
                        border: `1px solid ${colors.border}`,
                        transform: `scale(${cardScale})`,
                        opacity: cardOpacity,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: fonts.body,
                          fontSize: 13,
                          fontWeight: 500,
                          color: colors.foreground,
                          marginBottom: card.subtitle ? 4 : 0,
                        }}
                      >
                        {card.title}
                      </div>
                      {card.subtitle && (
                        <div
                          style={{
                            fontFamily: fonts.body,
                            fontSize: 11,
                            color: colors.mutedForeground,
                            marginBottom: card.status ? 8 : 0,
                          }}
                        >
                          {card.subtitle}
                        </div>
                      )}
                      {card.status && (
                        <StatusBadge
                          status={card.status}
                          size="sm"
                          delay={cardDelay + 0.1}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
