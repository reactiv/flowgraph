import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs } from '../lib/animations';
import { Background } from '../components/Background';
import { MockChat } from '../components/MockChat';

/**
 * Scene 6: Chat with Data (6s, frames 1470-1650)
 * "Of course, chat with your data"
 *
 * Quick chat interaction with graph responding in real-time.
 */

export function ChatScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Headline animation
  const headlineProgress = spring({
    frame,
    fps,
    config: springConfigs.smooth,
  });

  const headlineOpacity = interpolate(headlineProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Chat messages
  const messages = [
    {
      id: '1',
      role: 'user' as const,
      content: 'Show me all samples pending QC review',
      delay: 0.5,
    },
    {
      id: '2',
      role: 'assistant' as const,
      content: 'Found 12 samples pending QC review. Filtering graph view...',
      delay: 1.5,
    },
    {
      id: '3',
      role: 'user' as const,
      content: 'Flag anything overdue',
      delay: 3.0,
    },
    {
      id: '4',
      role: 'assistant' as const,
      content: '3 samples are overdue. I\'ve flagged them with high priority status.',
      delay: 3.8,
    },
  ];

  return (
    <AbsoluteFill>
      <Background variant="grid" glowColor={colors.primary} glowIntensity={0.2} />

      {/* Headline */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: headlineOpacity,
          zIndex: 10,
        }}
      >
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 48,
            fontWeight: 700,
            color: colors.foreground,
            margin: 0,
          }}
        >
          Of course,{' '}
          <span style={{ color: colors.primary }}>chat with your data</span>
        </h1>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 140,
          left: 80,
          right: 80,
          bottom: 40,
          display: 'flex',
          gap: 40,
        }}
      >
        {/* Chat panel */}
        <div style={{ flex: 1 }}>
          <MockChat messages={messages} delay={0.3} />
        </div>

        {/* Graph response visualization */}
        <div style={{ flex: 1.2 }}>
          <GraphResponseVisualization frame={frame} fps={fps} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function GraphResponseVisualization({ frame, fps }: { frame: number; fps: number }) {
  // Nodes that get filtered/highlighted based on chat
  const allNodes = [
    { id: '1', label: 'BX-2841', status: 'Reviewed', x: 100, y: 80, pending: false, overdue: false },
    { id: '2', label: 'BX-2842', status: 'Pending', x: 280, y: 60, pending: true, overdue: false },
    { id: '3', label: 'BX-2843', status: 'Pending', x: 460, y: 100, pending: true, overdue: true },
    { id: '4', label: 'BX-2844', status: 'Released', x: 640, y: 80, pending: false, overdue: false },
    { id: '5', label: 'BX-2845', status: 'Pending', x: 150, y: 220, pending: true, overdue: false },
    { id: '6', label: 'BX-2846', status: 'Pending', x: 330, y: 200, pending: true, overdue: true },
    { id: '7', label: 'BX-2847', status: 'Reviewed', x: 510, y: 240, pending: false, overdue: false },
    { id: '8', label: 'BX-2848', status: 'Pending', x: 690, y: 220, pending: true, overdue: false },
    { id: '9', label: 'BX-2849', status: 'Pending', x: 200, y: 360, pending: true, overdue: false },
    { id: '10', label: 'BX-2850', status: 'Released', x: 380, y: 340, pending: false, overdue: false },
    { id: '11', label: 'BX-2851', status: 'Pending', x: 560, y: 380, pending: true, overdue: true },
    { id: '12', label: 'BX-2852', status: 'Pending', x: 740, y: 360, pending: true, overdue: false },
  ];

  // Animation phases based on chat timing
  const filterPhase = interpolate(frame, [fps * 1.5, fps * 2.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const flagPhase = interpolate(frame, [fps * 3.8, fps * 4.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const containerProgress = spring({
    frame,
    fps,
    config: springConfigs.smooth,
  });

  const containerOpacity = interpolate(containerProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 24,
        height: '100%',
        opacity: containerOpacity,
        position: 'relative',
      }}
    >
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 14,
          fontWeight: 600,
          color: colors.mutedForeground,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Graph View</span>
        {filterPhase > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: filterPhase,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: colors.primary,
              }}
            />
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: colors.primary,
              }}
            >
              Filtered: 12 pending
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          height: 'calc(100% - 40px)',
        }}
      >
        {allNodes.map((node) => {
          // Calculate node visibility/highlighting
          const isPending = node.pending;
          const isOverdue = node.overdue;

          // During filter phase, non-pending nodes fade out
          const nodeOpacity =
            filterPhase > 0
              ? isPending
                ? 1
                : interpolate(filterPhase, [0, 1], [1, 0.2])
              : 1;

          // During flag phase, overdue nodes get highlighted
          const isHighlighted = flagPhase > 0 && isOverdue;
          const highlightScale = isHighlighted
            ? interpolate(flagPhase, [0, 0.5, 1], [1, 1.15, 1.1])
            : 1;

          const nodeColor = isHighlighted
            ? colors.destructive
            : isPending
              ? colors.warning
              : colors.success;

          // Pulse effect for flagged items
          const pulseOpacity = isHighlighted
            ? 0.3 + Math.sin((frame / fps) * Math.PI * 4) * 0.2
            : 0;

          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                transform: `scale(${highlightScale})`,
                opacity: nodeOpacity,
                transition: 'none',
              }}
            >
              {/* Pulse ring for flagged */}
              {isHighlighted && (
                <div
                  style={{
                    position: 'absolute',
                    inset: -10,
                    borderRadius: '50%',
                    border: `2px solid ${colors.destructive}`,
                    opacity: pulseOpacity,
                  }}
                />
              )}

              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  backgroundColor: colors.muted,
                  border: `2px solid ${nodeColor}`,
                  boxShadow: isHighlighted ? `0 0 20px ${nodeColor}60` : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 9,
                    color: colors.foreground,
                  }}
                >
                  {node.label}
                </span>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 8,
                    color: nodeColor,
                  }}
                >
                  {isHighlighted ? 'OVERDUE' : node.status}
                </span>
              </div>

              {/* Flag icon for overdue */}
              {isHighlighted && flagPhase > 0.5 && (
                <div
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    backgroundColor: colors.destructive,
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill={colors.foreground}
                    stroke="none"
                  >
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line
                      x1="4"
                      y1="22"
                      x2="4"
                      y2="15"
                      stroke={colors.foreground}
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}

        {/* Connection lines */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          <defs>
            <marker
              id="chat-arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={colors.primary} fillOpacity={0.6} />
            </marker>
          </defs>
          {[
            [0, 1],
            [1, 2],
            [2, 3],
            [4, 5],
            [5, 6],
            [6, 7],
            [8, 9],
            [9, 10],
            [10, 11],
            [1, 5],
            [2, 6],
            [5, 9],
            [6, 10],
          ].map(([fromIdx, toIdx], i) => {
            const from = allNodes[fromIdx];
            const to = allNodes[toIdx];

            // Fade non-pending connections during filter
            const edgeOpacity =
              filterPhase > 0
                ? from.pending && to.pending
                  ? 0.6
                  : interpolate(filterPhase, [0, 1], [0.4, 0.1])
                : 0.4;

            return (
              <line
                key={i}
                x1={from.x + 30}
                y1={from.y + 30}
                x2={to.x + 30}
                y2={to.y + 30}
                stroke={colors.primary}
                strokeWidth={2}
                opacity={edgeOpacity}
                markerEnd="url(#chat-arrowhead)"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
