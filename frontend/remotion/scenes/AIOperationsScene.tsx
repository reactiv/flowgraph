import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion';
import { colors } from '../lib/theme';
import { fonts } from '../lib/fonts';
import { springConfigs } from '../lib/animations';
import { Background } from '../components/Background';
import { NodeSparkle } from '../components/NodeSparkle';

/**
 * Scene 4: AI Operations (10s, frames 810-1110)
 * "AI features are operations on the graph. Build once, use everywhere."
 *
 * Shows "Suggest Node" and "Suggest Field" working across different workflow types
 * with visually diverse, domain-specific graphs.
 */

const DEMO_DURATION = 135; // ~4.5 seconds per demo at 30fps

export function AIOperationsScene() {
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

  return (
    <AbsoluteFill>
      <Background variant="grid" glowColor={colors.secondary} glowIntensity={0.2} />

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
            marginBottom: 8,
          }}
        >
          AI features are{' '}
          <span style={{ color: colors.secondary }}>operations on the graph</span>
        </h1>
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 18,
            color: colors.mutedForeground,
          }}
        >
          Build once, use everywhere
        </div>
      </div>

      {/* Demo 1: Pharmaceutical QC - Suggest Node (hub-and-spoke, complex) */}
      <Sequence from={30} durationInFrames={DEMO_DURATION} premountFor={fps}>
        <PharmaQCDemo />
      </Sequence>

      {/* Demo 2: Equipment Maintenance - Suggest Field (linear chain) */}
      <Sequence from={30 + DEMO_DURATION} durationInFrames={DEMO_DURATION} premountFor={fps}>
        <EquipmentMaintenanceDemo />
      </Sequence>
    </AbsoluteFill>
  );
}

/**
 * Demo 1: Pharmaceutical QC - "Suggest Node"
 * Hub-and-spoke topology with central Batch node
 * AI suggests adding a Deviation Report when quality threshold exceeded
 */
function PharmaQCDemo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation phases
  const contextProgress = spring({
    frame,
    fps,
    config: springConfigs.smooth,
  });

  const thinkingProgress = spring({
    frame: frame - fps * 1.2,
    fps,
    config: springConfigs.smooth,
  });

  const suggestionProgress = spring({
    frame: frame - fps * 2.4,
    fps,
    config: springConfigs.bouncy,
  });

  const contextOpacity = interpolate(contextProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const thinkingOpacity = interpolate(thinkingProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const suggestionScale = interpolate(suggestionProgress, [0, 1], [0.8, 1]);
  const suggestionOpacity = interpolate(suggestionProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Hub-and-spoke layout with central Batch node
  const nodes = [
    // Central hub
    { id: 'batch', x: 600, y: 440, label: 'Batch #2847', size: 90, color: colors.primary },
    // Inner ring - connected to hub
    { id: 'raw', x: 350, y: 320, label: 'Raw Material', size: 60, color: colors.emerald },
    { id: 'qc1', x: 350, y: 560, label: 'QC Test #1', size: 55, color: colors.amber },
    { id: 'qc2', x: 600, y: 260, label: 'QC Test #2', size: 55, color: colors.amber },
    { id: 'qc3', x: 850, y: 320, label: 'QC Test #3', size: 55, color: colors.amber },
    { id: 'result', x: 850, y: 560, label: 'Result', size: 50, color: colors.violet },
    // Outer nodes
    { id: 'spec', x: 200, y: 380, label: 'Spec', size: 40, color: colors.teal },
    { id: 'pkg', x: 750, y: 680, label: 'Packaging', size: 50, color: colors.pink },
  ];

  const edges = [
    { from: 'raw', to: 'batch', label: 'feeds' },
    { from: 'spec', to: 'raw', label: 'defines' },
    { from: 'batch', to: 'qc1' },
    { from: 'batch', to: 'qc2' },
    { from: 'batch', to: 'qc3' },
    { from: 'qc1', to: 'result', label: 'produces' },
    { from: 'qc3', to: 'result' },
    { from: 'result', to: 'pkg', label: 'releases' },
  ];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const suggestionNode = { x: 1150, y: 440, label: 'Deviation Report', size: 80, color: colors.destructive };

  return (
    <div style={{ position: 'absolute', inset: 0, top: 140 }}>
      {/* Domain context badge */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 100,
          opacity: contextOpacity,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '8px 16px',
              fontFamily: fonts.heading,
              fontSize: 16,
              fontWeight: 600,
              color: colors.foreground,
            }}
          >
            Pharmaceutical QC
          </div>
          <div
            style={{
              backgroundColor: `${colors.destructive}20`,
              border: `1px solid ${colors.destructive}50`,
              borderRadius: 20,
              padding: '6px 12px',
              fontFamily: fonts.body,
              fontSize: 13,
              color: colors.destructive,
            }}
          >
            Suggest Node
          </div>
        </div>
      </div>

      {/* Edges */}
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
            id="ai-arrowhead"
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

          const dx = toNode.x - fromNode.x;
          const dy = toNode.y - fromNode.y;
          const angle = Math.atan2(dy, dx);

          const startX = fromNode.x + Math.cos(angle) * (fromNode.size / 2 + 5);
          const startY = fromNode.y + Math.sin(angle) * (fromNode.size / 2 + 5);
          const endX = toNode.x - Math.cos(angle) * (toNode.size / 2 + 15);
          const endY = toNode.y - Math.sin(angle) * (toNode.size / 2 + 15);

          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;

          // Use source node color for the edge
          const edgeColor = fromNode.color;

          return (
            <g key={i} opacity={contextOpacity}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={edgeColor}
                strokeWidth={3}
                strokeOpacity={0.7}
                markerEnd="url(#ai-arrowhead)"
              />
              {edge.label && (
                <>
                  <rect
                    x={midX - edge.label.length * 3.5 - 6}
                    y={midY - 9}
                    width={edge.label.length * 7 + 12}
                    height={16}
                    rx={4}
                    fill={colors.card}
                    stroke={edgeColor}
                    strokeWidth={1}
                    strokeOpacity={0.6}
                  />
                  <text
                    x={midX}
                    y={midY + 3}
                    textAnchor="middle"
                    fill={edgeColor}
                    fontSize={10}
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

        {/* Suggestion connection (dashed, animated) */}
        {suggestionProgress > 0 && (
          <line
            x1={nodeMap.get('result')!.x + 25}
            y1={nodeMap.get('result')!.y}
            x2={suggestionNode.x - suggestionNode.size / 2 - 10}
            y2={suggestionNode.y}
            stroke={colors.destructive}
            strokeWidth={3}
            strokeDasharray="10 5"
            opacity={suggestionOpacity * 0.8}
          />
        )}
      </svg>

      {/* Nodes */}
      {nodes.map((node) => (
        <div
          key={node.id}
          style={{
            position: 'absolute',
            left: node.x - node.size / 2,
            top: node.y - node.size / 2,
            width: node.size,
            height: node.size,
            opacity: contextOpacity,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              backgroundColor: colors.card,
              border: `3px solid ${node.color}`,
              boxShadow: node.id === 'batch' ? `0 0 30px ${node.color}40` : `0 0 15px ${node.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: node.size > 70 ? 11 : 9,
                color: node.color,
                textTransform: 'uppercase',
                textAlign: 'center',
                padding: 4,
                lineHeight: 1.2,
              }}
            >
              {node.label}
            </span>
          </div>
        </div>
      ))}

      {/* AI Thinking indicator */}
      {thinkingProgress > 0 && suggestionProgress < 0.5 && (
        <div
          style={{
            position: 'absolute',
            left: 950,
            top: 380,
            opacity: thinkingOpacity * (1 - suggestionProgress * 2),
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '12px 20px',
            }}
          >
            <ThinkingDots frame={frame} fps={fps} />
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: 13,
                color: colors.mutedForeground,
              }}
            >
              QC threshold exceeded...
            </span>
          </div>
        </div>
      )}

      {/* AI Suggestion */}
      {suggestionProgress > 0 && (
        <>
          <NodeSparkle
            x={suggestionNode.x}
            y={suggestionNode.y}
            color={suggestionNode.color}
            delay={0}
            size={160}
          />
          <div
            style={{
              position: 'absolute',
              left: suggestionNode.x - suggestionNode.size / 2,
              top: suggestionNode.y - suggestionNode.size / 2,
              width: suggestionNode.size,
              height: suggestionNode.size,
              transform: `scale(${suggestionScale})`,
              opacity: suggestionOpacity,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: colors.card,
                border: `3px solid ${suggestionNode.color}`,
                boxShadow: `0 0 40px ${suggestionNode.color}50`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: suggestionNode.color,
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  padding: 4,
                  lineHeight: 1.2,
                }}
              >
                {suggestionNode.label}
              </span>
            </div>
          </div>

          {/* Suggestion label */}
          <div
            style={{
              position: 'absolute',
              left: suggestionNode.x - 100,
              top: suggestionNode.y + suggestionNode.size / 2 + 20,
              width: 200,
              opacity: suggestionOpacity,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.card,
                border: `2px solid ${suggestionNode.color}`,
                borderRadius: 8,
                padding: '8px 14px',
                boxShadow: `0 0 20px ${suggestionNode.color}30`,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={suggestionNode.color}
                strokeWidth="2"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span
                style={{
                  fontFamily: fonts.body,
                  fontSize: 12,
                  fontWeight: 500,
                  color: colors.foreground,
                }}
              >
                AI Suggestion
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Demo 2: Equipment Maintenance - "Suggest Field"
 * Linear workflow with branches for a maintenance ticket
 * AI suggests adding a "Root Cause" field based on pattern detection
 */
function EquipmentMaintenanceDemo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation phases
  const contextProgress = spring({
    frame,
    fps,
    config: springConfigs.smooth,
  });

  const thinkingProgress = spring({
    frame: frame - fps * 1.2,
    fps,
    config: springConfigs.smooth,
  });

  const suggestionProgress = spring({
    frame: frame - fps * 2.4,
    fps,
    config: springConfigs.bouncy,
  });

  const contextOpacity = interpolate(contextProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const thinkingOpacity = interpolate(thinkingProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const suggestionScale = interpolate(suggestionProgress, [0, 1], [0.9, 1]);
  const suggestionOpacity = interpolate(suggestionProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Linear chain with branches - equipment maintenance flow
  const nodes = [
    // Main chain (top)
    { id: 'asset', x: 200, y: 350, label: 'Asset #CF-204', size: 70, color: colors.teal },
    { id: 'ticket', x: 480, y: 350, label: 'Work Order', size: 80, color: colors.amber },
    { id: 'tech', x: 760, y: 350, label: 'Technician', size: 60, color: colors.violet },
    { id: 'complete', x: 1040, y: 350, label: 'Complete', size: 65, color: colors.success },
    // Branch nodes
    { id: 'history', x: 200, y: 520, label: 'Service History', size: 55, color: colors.pink },
    { id: 'parts', x: 620, y: 520, label: 'Parts Used', size: 50, color: colors.emerald },
  ];

  const edges = [
    { from: 'asset', to: 'ticket', label: 'creates' },
    { from: 'ticket', to: 'tech', label: 'assigned' },
    { from: 'tech', to: 'complete', label: 'resolves' },
    { from: 'asset', to: 'history' },
    { from: 'ticket', to: 'parts', label: 'requires' },
  ];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // The "Work Order" node gets a field suggestion
  const targetNode = nodeMap.get('ticket')!;

  return (
    <div style={{ position: 'absolute', inset: 0, top: 140 }}>
      {/* Domain context badge */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 100,
          opacity: contextOpacity,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '8px 16px',
              fontFamily: fonts.heading,
              fontSize: 16,
              fontWeight: 600,
              color: colors.foreground,
            }}
          >
            Equipment Maintenance
          </div>
          <div
            style={{
              backgroundColor: `${colors.info}20`,
              border: `1px solid ${colors.info}50`,
              borderRadius: 20,
              padding: '6px 12px',
              fontFamily: fonts.body,
              fontSize: 13,
              color: colors.info,
            }}
          >
            Suggest Field
          </div>
        </div>
      </div>

      {/* Edges */}
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
            id="ai-arrow-maint"
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

          const dx = toNode.x - fromNode.x;
          const dy = toNode.y - fromNode.y;
          const angle = Math.atan2(dy, dx);

          const startX = fromNode.x + Math.cos(angle) * (fromNode.size / 2 + 5);
          const startY = fromNode.y + Math.sin(angle) * (fromNode.size / 2 + 5);
          const endX = toNode.x - Math.cos(angle) * (toNode.size / 2 + 15);
          const endY = toNode.y - Math.sin(angle) * (toNode.size / 2 + 15);

          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;

          // Use source node color for the edge
          const edgeColor = fromNode.color;

          return (
            <g key={i} opacity={contextOpacity}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={edgeColor}
                strokeWidth={3}
                strokeOpacity={0.7}
                markerEnd="url(#ai-arrow-maint)"
              />
              {edge.label && (
                <>
                  <rect
                    x={midX - edge.label.length * 3.5 - 6}
                    y={midY - 9}
                    width={edge.label.length * 7 + 12}
                    height={16}
                    rx={4}
                    fill={colors.card}
                    stroke={edgeColor}
                    strokeWidth={1}
                    strokeOpacity={0.6}
                  />
                  <text
                    x={midX}
                    y={midY + 3}
                    textAnchor="middle"
                    fill={edgeColor}
                    fontSize={10}
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
      {nodes.map((node) => (
        <div
          key={node.id}
          style={{
            position: 'absolute',
            left: node.x - node.size / 2,
            top: node.y - node.size / 2,
            width: node.size,
            height: node.size,
            opacity: contextOpacity,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              backgroundColor: colors.card,
              border: `3px solid ${node.color}`,
              boxShadow: node.id === 'ticket' ? `0 0 25px ${node.color}40` : `0 0 12px ${node.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: node.size > 70 ? 10 : 9,
                color: node.color,
                textTransform: 'uppercase',
                textAlign: 'center',
                padding: 4,
                lineHeight: 1.2,
              }}
            >
              {node.label}
            </span>
          </div>
        </div>
      ))}

      {/* AI Thinking indicator */}
      {thinkingProgress > 0 && suggestionProgress < 0.5 && (
        <div
          style={{
            position: 'absolute',
            left: 480,
            top: 200,
            opacity: thinkingOpacity * (1 - suggestionProgress * 2),
            transform: 'translateX(-50%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '12px 20px',
            }}
          >
            <ThinkingDots frame={frame} fps={fps} />
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: 13,
                color: colors.mutedForeground,
              }}
            >
              Analyzing service patterns...
            </span>
          </div>
        </div>
      )}

      {/* Field Suggestion Card - appears near the Work Order node */}
      {suggestionProgress > 0 && (
        <>
          {/* Highlight glow on target node */}
          <div
            style={{
              position: 'absolute',
              left: targetNode.x - targetNode.size / 2 - 10,
              top: targetNode.y - targetNode.size / 2 - 10,
              width: targetNode.size + 20,
              height: targetNode.size + 20,
              borderRadius: '50%',
              border: `3px solid ${colors.info}`,
              boxShadow: `0 0 30px ${colors.info}60`,
              opacity: suggestionOpacity,
              pointerEvents: 'none',
            }}
          />

          {/* Field suggestion card */}
          <div
            style={{
              position: 'absolute',
              left: targetNode.x + targetNode.size / 2 + 30,
              top: targetNode.y - 80,
              width: 260,
              transform: `scale(${suggestionScale})`,
              opacity: suggestionOpacity,
            }}
          >
            <div
              style={{
                backgroundColor: colors.card,
                border: `2px solid ${colors.info}`,
                borderRadius: 12,
                padding: 16,
                boxShadow: `0 0 30px ${colors.info}40`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.info}
                  strokeWidth="2"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    color: colors.info,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  AI Suggestion
                </span>
              </div>

              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.foreground,
                  marginBottom: 8,
                }}
              >
                Add field to Work Order
              </div>

              {/* Suggested field preview */}
              <div
                style={{
                  backgroundColor: colors.muted,
                  borderRadius: 8,
                  padding: 12,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.body,
                      fontSize: 12,
                      color: colors.mutedForeground,
                    }}
                  >
                    Root Cause
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 10,
                      color: colors.info,
                      backgroundColor: `${colors.info}20`,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    enum
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 13,
                    fontWeight: 500,
                    color: colors.foreground,
                    marginTop: 6,
                  }}
                >
                  Bearing wear
                </div>
              </div>

              <div
                style={{
                  fontFamily: fonts.body,
                  fontSize: 11,
                  color: colors.mutedForeground,
                  marginTop: 10,
                  lineHeight: 1.4,
                }}
              >
                Pattern detected: 73% of similar failures trace to bearing issues
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ThinkingDots({ frame, fps }: { frame: number; fps: number }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2].map((i) => {
        const delay = i * 0.15;
        const bounce = Math.sin((frame / fps - delay) * Math.PI * 3);
        const y = bounce > 0 ? bounce * -4 : 0;

        return (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: colors.primary,
              transform: `translateY(${y}px)`,
            }}
          />
        );
      })}
    </div>
  );
}
