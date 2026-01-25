import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs, staggerDelay } from '../lib/animations';

interface GanttTask {
  id: string;
  label: string;
  start: number; // 0-100 percentage
  duration: number; // percentage of total width
  color: string;
  progress?: number; // 0-100 completion
}

interface MockGanttProps {
  tasks: GanttTask[];
  delay?: number;
  title?: string;
  timeLabels?: string[];
}

export function MockGantt({
  tasks,
  delay = 0,
  title,
  timeLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
}: MockGanttProps) {
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

  const chartWidth = 600;
  const labelWidth = 140;
  const rowHeight = 44;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 32,
        opacity: containerOpacity,
        width: chartWidth + labelWidth + 64, // chart + labels + padding
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
          backgroundColor: colors.card,
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.muted,
          }}
        >
          <div
            style={{
              width: labelWidth,
              padding: '12px 16px',
              fontFamily: fonts.heading,
              fontSize: 12,
              fontWeight: 600,
              color: colors.foreground,
              borderRight: `1px solid ${colors.border}`,
            }}
          >
            Task
          </div>
          <div style={{ display: 'flex', flex: 1 }}>
            {timeLabels.map((label, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  color: colors.mutedForeground,
                  textAlign: 'center',
                  borderRight:
                    i < timeLabels.length - 1
                      ? `1px solid ${colors.border}`
                      : undefined,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {tasks.map((task, i) => {
          const rowDelay = delay + 0.15 + staggerDelay(i, 4) / fps;
          const rowProgress = spring({
            frame: frame - rowDelay * fps,
            fps,
            config: springConfigs.snappy,
          });

          const rowOpacity = interpolate(rowProgress, [0, 0.5], [0, 1], {
            extrapolateRight: 'clamp',
          });

          const barProgress = spring({
            frame: frame - (rowDelay + 0.1) * fps,
            fps,
            config: springConfigs.smooth,
          });

          const barWidth = interpolate(barProgress, [0, 1], [0, task.duration]);

          return (
            <div
              key={task.id}
              style={{
                display: 'flex',
                height: rowHeight,
                borderBottom:
                  i < tasks.length - 1
                    ? `1px solid ${colors.border}`
                    : undefined,
                opacity: rowOpacity,
              }}
            >
              {/* Label */}
              <div
                style={{
                  width: labelWidth,
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: fonts.body,
                  fontSize: 13,
                  fontWeight: 500,
                  color: colors.foreground,
                  borderRight: `1px solid ${colors.border}`,
                  backgroundColor: colors.card,
                }}
              >
                {task.label}
              </div>

              {/* Chart area */}
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  padding: '8px 0',
                }}
              >
                {/* Grid lines */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                  }}
                >
                  {timeLabels.map((_, j) => (
                    <div
                      key={j}
                      style={{
                        flex: 1,
                        borderRight:
                          j < timeLabels.length - 1
                            ? `1px dashed ${colors.border}50`
                            : undefined,
                      }}
                    />
                  ))}
                </div>

                {/* Bar */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${task.start}%`,
                    top: 8,
                    bottom: 8,
                    width: `${barWidth}%`,
                    backgroundColor: `${task.color}30`,
                    borderRadius: 4,
                    border: `1px solid ${task.color}50`,
                    overflow: 'hidden',
                  }}
                >
                  {/* Progress fill */}
                  {task.progress !== undefined && task.progress > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${task.progress}%`,
                        backgroundColor: task.color,
                        opacity: 0.5,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
