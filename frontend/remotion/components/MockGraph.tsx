import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs, staggerDelay } from '../lib/animations';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  color?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

interface MockGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  delay?: number;
  title?: string;
  nodeSize?: number;
}

export function MockGraph({
  nodes,
  edges,
  delay = 0,
  title,
  nodeSize = 80,
}: MockGraphProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Build node map for edge rendering
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: 32,
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
            marginBottom: 24,
          }}
        >
          {title}
        </h3>
      )}

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
          <marker
            id="graph-arrowhead"
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

          const edgeDelay = delay + 0.3 + staggerDelay(i, 3) / fps;
          const edgeProgress = spring({
            frame: frame - edgeDelay * fps,
            fps,
            config: springConfigs.smooth,
          });

          const pathOpacity = interpolate(edgeProgress, [0, 0.5], [0, 1], {
            extrapolateRight: 'clamp',
          });

          // Calculate edge path with curve
          const x1 = fromNode.x + nodeSize / 2 + 32;
          const y1 = fromNode.y + nodeSize / 2 + 64;
          const x2 = toNode.x + nodeSize / 2 + 32;
          const y2 = toNode.y + nodeSize / 2 + 64;

          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const curveOffset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.3;

          // Offset for node radius
          const angle = Math.atan2(dy, dx);
          const startX = x1 + Math.cos(angle) * (nodeSize / 2 + 5);
          const startY = y1 + Math.sin(angle) * (nodeSize / 2 + 5);
          const endX = x2 - Math.cos(angle) * (nodeSize / 2 + 18);
          const endY = y2 - Math.sin(angle) * (nodeSize / 2 + 18);

          // Edge color based on source node
          const edgeColor = fromNode.color || colors.primary;

          return (
            <g key={i} style={{ opacity: pathOpacity }}>
              {/* Edge line */}
              <path
                d={`M ${startX} ${startY} Q ${midX} ${midY - curveOffset} ${endX} ${endY}`}
                fill="none"
                stroke={edgeColor}
                strokeWidth={3}
                strokeOpacity={0.7}
                markerEnd="url(#graph-arrowhead)"
              />
              {/* Label background */}
              {edge.label && (
                <rect
                  x={midX - edge.label.length * 3.5 - 6}
                  y={midY - curveOffset / 2 - 20}
                  width={edge.label.length * 7 + 12}
                  height={18}
                  rx={4}
                  fill={colors.card}
                  stroke={edgeColor}
                  strokeWidth={1}
                  strokeOpacity={0.5}
                />
              )}
              {/* Label text */}
              {edge.label && (
                <text
                  x={midX}
                  y={midY - curveOffset / 2 - 7}
                  textAnchor="middle"
                  fill={edgeColor}
                  fontSize={11}
                  fontFamily={fonts.mono}
                  fontWeight={500}
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {nodes.map((node, i) => {
        const nodeDelay = delay + staggerDelay(i, 5) / fps;
        const nodeProgress = spring({
          frame: frame - nodeDelay * fps,
          fps,
          config: springConfigs.bouncy,
        });

        const nodeScale = interpolate(nodeProgress, [0, 1], [0, 1]);
        const nodeOpacity = interpolate(nodeProgress, [0, 0.3], [0, 1], {
          extrapolateRight: 'clamp',
        });

        const nodeColor = node.color || colors.primary;

        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: node.x + 32,
              top: node.y + 64,
              width: nodeSize,
              height: nodeSize,
              transform: `scale(${nodeScale})`,
              opacity: nodeOpacity,
            }}
          >
            {/* Node circle */}
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: colors.card,
                border: `2px solid ${nodeColor}`,
                boxShadow: `0 0 20px ${nodeColor}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: nodeColor,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {node.type}
              </span>
            </div>
            {/* Node label */}
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: 8,
                fontFamily: fonts.body,
                fontSize: 11,
                fontWeight: 500,
                color: colors.foreground,
                whiteSpace: 'nowrap',
                textAlign: 'center',
              }}
            >
              {node.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
