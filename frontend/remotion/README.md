# Remotion Sizzle Video

A 57-second promotional video for Curie Omni built with [Remotion](https://www.remotion.dev/) - a framework for creating videos programmatically with React.

## Quick Start

```bash
# Preview in Remotion Studio (interactive)
./scripts/dc exec -T frontend npm run remotion:studio

# Render final video
./scripts/dc exec -T frontend npm run remotion:render

# Output: frontend/out/sizzle.mp4
```

## Video Structure

**Total Duration:** 57 seconds (1710 frames @ 30fps)
**Resolution:** 1920x1080
**Format:** H.264 MP4

### Scene Timeline

| Scene | Frames | Duration | Description |
|-------|--------|----------|-------------|
| **1. Problem** | 0-180 | 6s | Fragmented workflows chaos - Excel, Notion, email icons with warning indicators |
| **2. Insight** | 180-360 | 6s | "Any workflow is just a graph" - nodes emerge and connect with glow effect |
| **3. Views** | 360-810 | 15s | Five view types cycling (3s each): Kanban, Graph, Gantt, Timeline, Cards |
| **4. AI Operations** | 810-1110 | 10s | Two demos: Suggest Node (Pharma QC) and Suggest Field (Equipment Maintenance) |
| **5. Connector** | 1110-1470 | 12s | Agent learning from URLs/files, transforms to connectors |
| **6. Chat** | 1470-1650 | 6s | "Chat with your data" - interactive graph filtering |
| **7. Outro** | 1650-1710 | 2s | Logo animation and call to action |

## Project Structure

```
frontend/remotion/
├── index.ts                    # Entry point
├── Root.tsx                    # Remotion composition registration
├── remotion.config.ts          # Remotion configuration
├── style.css                   # Global styles
├── tailwind.config.js          # Tailwind for Remotion
├── compositions/
│   └── SizzleVideo.tsx         # Main video composition
├── scenes/
│   ├── ProblemScene.tsx        # Scene 1: Fragmented workflows
│   ├── InsightScene.tsx        # Scene 2: Graph revelation
│   ├── ViewsScene.tsx          # Scene 3: Five view types
│   ├── AIOperationsScene.tsx   # Scene 4: Suggest Node/Field
│   ├── ConnectorScene.tsx      # Scene 5: Agent learning
│   ├── ChatScene.tsx           # Scene 6: Chat interaction
│   └── OutroScene.tsx          # Scene 7: Call to action
├── components/
│   ├── Background.tsx          # Grid/gradient backgrounds
│   ├── DataFlow.tsx            # Animated particle connections
│   ├── MockKanban.tsx          # Kanban board visualization
│   ├── MockGraph.tsx           # Graph visualization
│   ├── MockGantt.tsx           # Gantt chart visualization
│   ├── MockTimeline.tsx        # Timeline visualization
│   ├── MockCards.tsx           # Card grid visualization
│   ├── MockChat.tsx            # Chat interface
│   ├── NodeSparkle.tsx         # Highlight effects
│   ├── StatusBadge.tsx         # Status indicators
│   └── TypewriterText.tsx      # Progressive text reveal
├── lib/
│   ├── theme.ts                # Color palette (hardcoded hex)
│   ├── fonts.ts                # Google Fonts setup
│   ├── animations.ts           # Spring configs and utilities
│   └── domains.ts              # Domain-specific data
└── public/remotion/
    └── curie-omni-logo.svg     # Logo asset
```

## Technical Notes

### Remotion Constraints

1. **No CSS Variables** - Colors must be hardcoded hex values (CSS `var()` doesn't work)
2. **No CSS Transitions** - Use Remotion's `spring()` and `interpolate()` for all animations
3. **Deterministic Rendering** - Avoid `Math.random()` in render; use frame-based calculations
4. **Absolute Positioning** - Sequence components create absolute-positioned containers

### Animation Patterns

```tsx
import { spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

function MyComponent() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring animation with delay
  const progress = spring({
    frame: frame - 30, // 1 second delay
    fps,
    config: { damping: 200, mass: 0.5 },
  });

  // Map progress to visual property
  const opacity = interpolate(progress, [0, 1], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return <div style={{ opacity }}>...</div>;
}
```

### Docker Rendering

The Dockerfile includes Chrome Headless dependencies required for rendering:

```dockerfile
RUN apt-get install -y libnss3 libatk1.0-0 libgbm1 ffmpeg ...
```

## Customization

### Modifying Scenes

Each scene is a self-contained React component. To adjust timing:

1. Edit frame ranges in `compositions/SizzleVideo.tsx`
2. Update `durationInFrames` in the relevant `<Sequence>` component

### Adding New Scenes

1. Create component in `scenes/`
2. Import and add to `SizzleVideo.tsx` with appropriate frame range
3. Adjust total duration in `Root.tsx` if needed

### Changing Colors

Edit `lib/theme.ts` - all colors are defined there as hex values.

### Changing Fonts

Edit `lib/fonts.ts` - uses `@remotion/google-fonts` for web font loading.

## Rendering Options

```bash
# Custom output path
./scripts/dc exec -T frontend npx remotion render remotion/index.ts SizzleVideo custom-output.mp4

# Different quality (CRF: 0=lossless, 51=worst)
./scripts/dc exec -T frontend npx remotion render remotion/index.ts SizzleVideo out/sizzle.mp4 --crf 18

# Specific frame range (for testing)
./scripts/dc exec -T frontend npx remotion render remotion/index.ts SizzleVideo out/test.mp4 --frames=0-180
```

## Troubleshooting

**"Chrome not found" error:**
Ensure Docker image is rebuilt: `./scripts/dc build frontend`

**Fonts not loading:**
Fonts are loaded via `@remotion/google-fonts`. Check `lib/fonts.ts` imports.

**Animation jitter:**
Avoid `Math.random()` or time-based calculations. Use `frame` for deterministic values.
