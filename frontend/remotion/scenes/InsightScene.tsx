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

/**
 * Scene 2: The Insight (6s, frames 180-360)
 * "Any workflow can be represented as a graph"
 *
 * Transform the chaos into a clean graph structure.
 * Visual: Nodes spring in with connections forming. Cyan glow.
 */
export function InsightScene() {
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
  const headlineY = interpolate(headlineProgress, [0, 1], [30, 0]);

  // Graph nodes emerge from center
  const nodes = [
    { id: 'center', label: 'Workflow', x: 960, y: 440, delay: 0.5, size: 100, color: colors.primary },
    { id: 'sample', label: 'Sample', x: 600, y: 300, delay: 0.8, size: 70, color: colors.emerald },
    { id: 'analysis', label: 'Analysis', x: 1320, y: 300, delay: 0.9, size: 70, color: colors.amber },
    { id: 'result', label: 'Result', x: 600, y: 580, delay: 1.0, size: 70, color: colors.violet },
    { id: 'report', label: 'Report', x: 1320, y: 580, delay: 1.1, size: 70, color: colors.pink },
    { id: 'task1', label: 'Task', x: 400, y: 440, delay: 1.2, size: 50, color: colors.teal },
    { id: 'task2', label: 'Task', x: 1520, y: 440, delay: 1.3, size: 50, color: colors.teal },
  ];

  const edges = [
    { from: 'center', to: 'sample', delay: 1.4, label: 'contains' },
    { from: 'center', to: 'analysis', delay: 1.5, label: 'contains' },
    { from: 'center', to: 'result', delay: 1.6, label: 'contains' },
    { from: 'center', to: 'report', delay: 1.7, label: 'contains' },
    { from: 'sample', to: 'task1', delay: 1.8, label: 'triggers' },
    { from: 'analysis', to: 'task2', delay: 1.9, label: 'triggers' },
    { from: 'sample', to: 'analysis', delay: 2.0, label: 'feeds' },
    { from: 'result', to: 'report', delay: 2.1, label: 'documents' },
  ];

  // Build node map
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <AbsoluteFill>
      <Background variant="grid" glowColor={colors.primary} glowIntensity={0.25} />

      {/* Headline */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          zIndex: 10,
        }}
      >
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 56,
            fontWeight: 700,
            color: colors.foreground,
            margin: 0,
            letterSpacing: -1,
          }}
        >
          Any workflow is{' '}
          <span style={{ color: colors.primary }}>just a graph</span>
        </h1>
      </div>

      {/* SVG for edges */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker
            id="insight-arrowhead"
            markerWidth="12"
            markerHeight="9"
            refX="10"
            refY="4.5"
            orient="auto"
          >
            <polygon points="0 0, 12 4.5, 0 9" fill={colors.primary} />
          </marker>
        </defs>

        {edges.map((edge, i) => {
          const fromNode = nodeMap.get(edge.from);
          const toNode = nodeMap.get(edge.to);
          if (!fromNode || !toNode) return null;

          const edgeProgress = spring({
            frame: frame - edge.delay * fps,
            fps,
            config: springConfigs.smooth,
          });

          const dx = toNode.x - fromNode.x;
          const dy = toNode.y - fromNode.y;
          const angle = Math.atan2(dy, dx);

          // Offset from node centers based on node size
          const startX = fromNode.x + Math.cos(angle) * (fromNode.size / 2 + 5);
          const startY = fromNode.y + Math.sin(angle) * (fromNode.size / 2 + 5);
          const endX = toNode.x - Math.cos(angle) * (toNode.size / 2 + 15);
          const endY = toNode.y - Math.sin(angle) * (toNode.size / 2 + 15);

          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;

          const length = Math.sqrt(
            Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
          );
          const dashOffset = interpolate(edgeProgress, [0, 1], [length, 0]);
          const opacity = interpolate(edgeProgress, [0, 0.3], [0, 1], {
            extrapolateRight: 'clamp',
          });

          return (
            <g key={i} style={{ opacity }}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={colors.primary}
                strokeWidth={3}
                strokeDasharray={length}
                strokeDashoffset={dashOffset}
                filter="url(#glow)"
                markerEnd="url(#insight-arrowhead)"
              />
              {/* Edge label - show after line is mostly drawn */}
              {edge.label && edgeProgress > 0.85 && (
                <>
                  <rect
                    x={midX - edge.label.length * 3.5 - 6}
                    y={midY - 10}
                    width={edge.label.length * 7 + 12}
                    height={18}
                    rx={4}
                    fill={colors.card}
                    stroke={colors.primary}
                    strokeWidth={1}
                    strokeOpacity={0.5}
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    textAnchor="middle"
                    fill={colors.primary}
                    fontSize={11}
                    fontFamily={fonts.mono}
                    fontWeight={500}
                  >
                    {edge.label}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {nodes.map((node) => {
        const nodeProgress = spring({
          frame: frame - node.delay * fps,
          fps,
          config: springConfigs.bouncy,
        });

        const scale = interpolate(nodeProgress, [0, 1], [0, 1]);
        const opacity = interpolate(nodeProgress, [0, 0.3], [0, 1], {
          extrapolateRight: 'clamp',
        });

        // Subtle pulse for center node
        const isCenter = node.id === 'center';
        const pulseScale = isCenter
          ? 1 + Math.sin((frame / fps) * Math.PI * 2) * 0.03
          : 1;

        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: node.x - node.size / 2,
              top: node.y - node.size / 2,
              width: node.size,
              height: node.size,
              transform: `scale(${scale * pulseScale})`,
              opacity,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: colors.card,
                border: `3px solid ${node.color}`,
                boxShadow: `0 0 ${isCenter ? 40 : 20}px ${node.color}50`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: isCenter ? 16 : 12,
                  fontWeight: 600,
                  color: node.color,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {node.label}
              </span>
            </div>
          </div>
        );
      })}

      {/* "Aha" moment sparkle effect */}
      <AhaSparkle frame={frame} fps={fps} />
    </AbsoluteFill>
  );
}

function AhaSparkle({ frame, fps }: { frame: number; fps: number }) {
  const sparkleDelay = 2.3;
  const progress = spring({
    frame: frame - sparkleDelay * fps,
    fps,
    config: springConfigs.bouncy,
  });

  const scale = interpolate(progress, [0, 1], [0, 1]);
  const opacity = interpolate(progress, [0, 0.5, 1], [0, 1, 0]);

  if (progress <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 960 - 150,
        top: 440 - 150,
        width: 300,
        height: 300,
        transform: `scale(${scale})`,
        opacity,
        pointerEvents: 'none',
      }}
    >
      {/* Radiating lines */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const lineProgress = spring({
          frame: frame - (sparkleDelay + i * 0.02) * fps,
          fps,
          config: springConfigs.quick,
        });
        const lineLength = interpolate(lineProgress, [0, 1], [0, 80]);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 3,
              height: lineLength,
              backgroundColor: colors.primary,
              borderRadius: 2,
              transform: `rotate(${(angle * 180) / Math.PI}deg)`,
              transformOrigin: '50% 0%',
              boxShadow: `0 0 10px ${colors.primary}`,
            }}
          />
        );
      })}
    </div>
  );
}
