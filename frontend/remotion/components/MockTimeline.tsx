import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs, staggerDelay } from '../lib/animations';
import { StatusBadge } from './StatusBadge';

interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  description?: string;
  status?: string;
  color: string;
}

interface MockTimelineProps {
  events: TimelineEvent[];
  delay?: number;
  title?: string;
}

export function MockTimeline({ events, delay = 0, title }: MockTimelineProps) {
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
        width: 700, // Fixed width for proper centering
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
          position: 'relative',
          paddingLeft: 32,
        }}
      >
        {/* Timeline line */}
        <div
          style={{
            position: 'absolute',
            left: 7,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: colors.border,
          }}
        />

        {/* Events */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {events.map((event, i) => {
            const eventDelay = delay + 0.15 + staggerDelay(i, 6) / fps;
            const eventProgress = spring({
              frame: frame - eventDelay * fps,
              fps,
              config: springConfigs.snappy,
            });

            const eventScale = interpolate(eventProgress, [0, 1], [0.9, 1]);
            const eventOpacity = interpolate(eventProgress, [0, 0.5], [0, 1], {
              extrapolateRight: 'clamp',
            });

            return (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  transform: `scale(${eventScale})`,
                  opacity: eventOpacity,
                  transformOrigin: 'left center',
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: colors.background,
                    border: `3px solid ${event.color}`,
                    boxShadow: `0 0 12px ${event.color}40`,
                  }}
                />

                {/* Content */}
                <div
                  style={{
                    flex: 1,
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${colors.border}`,
                    borderLeft: `3px solid ${event.color}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: event.description ? 8 : 0,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: fonts.heading,
                          fontSize: 14,
                          fontWeight: 600,
                          color: colors.foreground,
                        }}
                      >
                        {event.title}
                      </div>
                      <div
                        style={{
                          fontFamily: fonts.mono,
                          fontSize: 11,
                          color: colors.mutedForeground,
                          marginTop: 2,
                        }}
                      >
                        {event.date}
                      </div>
                    </div>
                    {event.status && (
                      <StatusBadge
                        status={event.status}
                        size="sm"
                        delay={eventDelay + 0.1}
                      />
                    )}
                  </div>
                  {event.description && (
                    <div
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 12,
                        color: colors.mutedForeground,
                        lineHeight: 1.5,
                      }}
                    >
                      {event.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
