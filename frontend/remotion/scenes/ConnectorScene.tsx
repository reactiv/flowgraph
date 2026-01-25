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
import { DataFlow } from '../components/DataFlow';

/**
 * Scene 5: Connector Learning (12s, frames 1110-1470)
 * "Agents learn how to connect"
 *
 * Two parts:
 * 5a. External Sources (6s) - Agent learns API structure from URL
 * 5b. Endpoint Learning (6s) - Complex file ingestion with transformation
 */

const PART_DURATION = 180; // 6 seconds at 30fps

export function ConnectorScene() {
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
      <Background variant="grid" glowColor={colors.accent} glowIntensity={0.2} />

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
          Agents{' '}
          <span style={{ color: colors.accent }}>learn how to connect</span>
        </h1>
      </div>

      {/* Part A: External Sources */}
      <Sequence from={30} durationInFrames={PART_DURATION - 30} premountFor={fps}>
        <ExternalSourceDemo />
      </Sequence>

      {/* Part B: File Transformation */}
      <Sequence from={PART_DURATION} durationInFrames={PART_DURATION} premountFor={fps}>
        <FileTransformDemo />
      </Sequence>
    </AbsoluteFill>
  );
}

function ExternalSourceDemo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation phases
  const urlProgress = spring({
    frame,
    fps,
    config: springConfigs.smooth,
  });

  const analyzeProgress = spring({
    frame: frame - fps * 1.5,
    fps,
    config: springConfigs.smooth,
  });

  const learnProgress = spring({
    frame: frame - fps * 3,
    fps,
    config: springConfigs.bouncy,
  });

  const urlOpacity = interpolate(urlProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const analyzeOpacity = interpolate(analyzeProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const learnScale = interpolate(learnProgress, [0, 1], [0.8, 1]);
  const learnOpacity = interpolate(learnProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        top: 120,
        padding: '0 100px',
      }}
    >
      {/* Subtitle */}
      <div
        style={{
          marginBottom: 32,
          opacity: urlOpacity,
        }}
      >
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 16,
            color: colors.mutedForeground,
          }}
        >
          External API Integration
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 500,
        }}
      >
        {/* Source: URL Input */}
        <div
          style={{
            opacity: urlOpacity,
            width: 400,
          }}
        >
          <div
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 24,
            }}
          >
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 12,
                color: colors.mutedForeground,
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Data Source
            </div>
            <div
              style={{
                backgroundColor: colors.input,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: '12px 16px',
                fontFamily: fonts.mono,
                fontSize: 14,
                color: colors.primary,
              }}
            >
              https://lims.lab.io/api/v1
            </div>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 8,
              }}
            >
              <div
                style={{
                  backgroundColor: `${colors.emerald}20`,
                  border: `1px solid ${colors.emerald}50`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.emerald,
                }}
              >
                REST API
              </div>
              <div
                style={{
                  backgroundColor: `${colors.amber}20`,
                  border: `1px solid ${colors.amber}50`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.amber,
                }}
              >
                OAuth 2.0
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Agent analyzing */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            opacity: analyzeOpacity,
          }}
        >
          {/* Data flow animation - positioned at box center height */}
          {analyzeProgress > 0.5 && (
            <>
              <DataFlow
                from={{ x: 520, y: 280 }}
                to={{ x: 720, y: 280 }}
                delay={0}
                duration={1.5}
                color={colors.primary}
              />
              <DataFlow
                from={{ x: 1080, y: 280 }}
                to={{ x: 1280, y: 280 }}
                delay={0.5}
                duration={1.5}
                color={colors.accent}
              />
            </>
          )}

          <div
            style={{
              backgroundColor: colors.card,
              border: `2px solid ${colors.primary}`,
              borderRadius: 16,
              padding: 24,
              boxShadow: `0 0 40px ${colors.primary}30`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.primary}
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 16,
                  fontWeight: 600,
                  color: colors.foreground,
                }}
              >
                Agent Learning
              </span>
            </div>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {['Discovering endpoints...', 'Mapping schema...', 'Building connector...'].map(
                (step, i) => {
                  const stepProgress = spring({
                    frame: frame - (1.5 + i * 0.5) * fps,
                    fps,
                    config: springConfigs.smooth,
                  });
                  const stepOpacity = interpolate(stepProgress, [0, 0.5], [0, 1], {
                    extrapolateRight: 'clamp',
                  });
                  const isComplete = frame > (2.5 + i * 0.5) * fps;

                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        opacity: stepOpacity,
                      }}
                    >
                      {isComplete ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={colors.success}
                          strokeWidth="3"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            border: `2px solid ${colors.primary}`,
                            borderTopColor: 'transparent',
                            animation: 'none',
                          }}
                        />
                      )}
                      <span
                        style={{
                          fontFamily: fonts.mono,
                          fontSize: 12,
                          color: isComplete ? colors.success : colors.mutedForeground,
                        }}
                      >
                        {step}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>

        {/* Result: Reusable Connector */}
        <div
          style={{
            opacity: learnOpacity,
            transform: `scale(${learnScale})`,
            width: 400,
          }}
        >
          <div
            style={{
              backgroundColor: colors.card,
              border: `2px solid ${colors.accent}`,
              borderRadius: 12,
              padding: 24,
              boxShadow: `0 0 30px ${colors.accent}40`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.accent}
                strokeWidth="2"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 16,
                  fontWeight: 600,
                  color: colors.accent,
                }}
              >
                LIMS Connector
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {['/samples', '/analyses', '/results', '/reports'].map((endpoint, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.muted,
                    borderRadius: 6,
                    padding: '8px 12px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 12,
                      color: colors.foreground,
                    }}
                  >
                    GET {endpoint}
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 10,
                      color: colors.success,
                    }}
                  >
                    mapped
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileTransformDemo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation phases
  const fileProgress = spring({
    frame,
    fps,
    config: springConfigs.smooth,
  });

  const transformProgress = spring({
    frame: frame - fps * 1.5,
    fps,
    config: springConfigs.smooth,
  });

  const resultProgress = spring({
    frame: frame - fps * 3.5,
    fps,
    config: springConfigs.bouncy,
  });

  const fileOpacity = interpolate(fileProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const transformOpacity = interpolate(transformProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const resultScale = interpolate(resultProgress, [0, 1], [0.8, 1]);
  const resultOpacity = interpolate(resultProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        top: 120,
        padding: '0 100px',
      }}
    >
      {/* Subtitle */}
      <div
        style={{
          marginBottom: 32,
          opacity: fileOpacity,
        }}
      >
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 16,
            color: colors.mutedForeground,
          }}
        >
          File Transformation Learning
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 500,
        }}
      >
        {/* Source: Messy CSV */}
        <div
          style={{
            opacity: fileOpacity,
            width: 380,
          }}
        >
          <div
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.amber}
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 13,
                  color: colors.foreground,
                }}
              >
                batch_records_2024.xlsx
              </span>
            </div>
            <div
              style={{
                backgroundColor: colors.input,
                borderRadius: 8,
                padding: 12,
                fontFamily: fonts.mono,
                fontSize: 10,
                color: colors.mutedForeground,
                lineHeight: 1.6,
                overflow: 'hidden',
              }}
            >
              <div style={{ color: colors.amber }}>// Inconsistent headers</div>
              <div>Lot#, ProductName, QTY...</div>
              <div style={{ color: colors.destructive }}>// Missing values</div>
              <div>L-2024-089, Widget A, 500</div>
              <div>L-2024-090, , 750</div>
              <div style={{ color: colors.amber }}>// Date format varies</div>
              <div>2024-01-15, Jan 16 2024...</div>
            </div>
          </div>
        </div>

        {/* Middle: Transformation */}
        <div
          style={{
            opacity: transformOpacity,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {/* Data flow - positioned at box center height */}
          {transformProgress > 0.5 && (
            <>
              <DataFlow
                from={{ x: 480, y: 280 }}
                to={{ x: 700, y: 280 }}
                delay={0}
                duration={1.5}
                color={colors.amber}
              />
              <DataFlow
                from={{ x: 1080, y: 280 }}
                to={{ x: 1280, y: 280 }}
                delay={0.5}
                duration={1.5}
                color={colors.accent}
              />
            </>
          )}

          <div
            style={{
              backgroundColor: colors.card,
              border: `2px solid ${colors.secondary}`,
              borderRadius: 16,
              padding: 20,
              boxShadow: `0 0 40px ${colors.secondary}30`,
              textAlign: 'center',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.secondary}
              strokeWidth="2"
              style={{ marginBottom: 8 }}
            >
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 14,
                fontWeight: 600,
                color: colors.foreground,
              }}
            >
              Learning Transform
            </div>
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: colors.mutedForeground,
                marginTop: 8,
              }}
            >
              Normalizing schema...
            </div>
          </div>
        </div>

        {/* Result: Clean API Endpoint */}
        <div
          style={{
            opacity: resultOpacity,
            transform: `scale(${resultScale})`,
            width: 400,
          }}
        >
          <div
            style={{
              backgroundColor: colors.card,
              border: `2px solid ${colors.accent}`,
              borderRadius: 12,
              padding: 20,
              boxShadow: `0 0 30px ${colors.accent}40`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.accent}
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.accent,
                }}
              >
                Structured Output
              </span>
            </div>
            <div
              style={{
                backgroundColor: colors.input,
                borderRadius: 8,
                padding: 12,
                fontFamily: fonts.mono,
                fontSize: 10,
                color: colors.foreground,
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: colors.mutedForeground }}>{'{'}</div>
              <div>&nbsp;&nbsp;{'"lot_id"'}: {'"L-2024-089"'},</div>
              <div>&nbsp;&nbsp;{'"product"'}: {'"Widget A"'},</div>
              <div>&nbsp;&nbsp;{'"quantity"'}: 500,</div>
              <div>&nbsp;&nbsp;{'"date"'}: {'"2024-01-15"'},</div>
              <div>&nbsp;&nbsp;{'"status"'}: {'"validated"'}</div>
              <div style={{ color: colors.mutedForeground }}>{'}'}</div>
            </div>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                gap: 8,
              }}
            >
              <div
                style={{
                  backgroundColor: `${colors.success}20`,
                  border: `1px solid ${colors.success}50`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.success,
                }}
              >
                Reusable
              </div>
              <div
                style={{
                  backgroundColor: `${colors.primary}20`,
                  border: `1px solid ${colors.primary}50`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.primary,
                }}
              >
                Schema Validated
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
