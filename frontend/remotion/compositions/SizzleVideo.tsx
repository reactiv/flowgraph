import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

import { ProblemScene } from '../scenes/ProblemScene';
import { InsightScene } from '../scenes/InsightScene';
import { ViewsScene } from '../scenes/ViewsScene';
import { AIOperationsScene } from '../scenes/AIOperationsScene';
import { ConnectorScene } from '../scenes/ConnectorScene';
import { ChatScene } from '../scenes/ChatScene';
import { OutroScene } from '../scenes/OutroScene';

/**
 * SizzleVideo - 60 second promotional video for Curie Omni
 *
 * Narrative Arc:
 * 1. The Problem (6s) - Building individual workflows doesn't scale
 * 2. The Insight (6s) - Any workflow is just a graph
 * 3. Views (15s) - Universal visualization across domains
 * 4. AI Operations (10s) - Build once, use everywhere
 * 5. Connector Learning (12s) - Agents learn how to connect
 * 6. Chat with Data (6s) - Natural language interaction
 * 7. Outro (5s) - Curie Omni branding
 *
 * Total: 60 seconds at 30fps = 1800 frames
 * Transitions overlap by 15 frames each, so we add extra frames to compensate.
 */

// Scene durations in frames (at 30fps)
const SCENES = {
  problem: 180, // 6s
  insight: 180, // 6s
  views: 450, // 15s
  aiOps: 300, // 10s
  connector: 360, // 12s
  chat: 180, // 6s
  outro: 150, // 5s
};

// Transition duration
const TRANSITION_FRAMES = 15;
const transitionTiming = linearTiming({ durationInFrames: TRANSITION_FRAMES });

export function SizzleVideo() {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0e14' }}>
      <TransitionSeries>
        {/* Scene 1: The Problem */}
        <TransitionSeries.Sequence durationInFrames={SCENES.problem}>
          <ProblemScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />

        {/* Scene 2: The Insight */}
        <TransitionSeries.Sequence durationInFrames={SCENES.insight}>
          <InsightScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />

        {/* Scene 3: Views Showcase */}
        <TransitionSeries.Sequence durationInFrames={SCENES.views}>
          <ViewsScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />

        {/* Scene 4: AI Operations */}
        <TransitionSeries.Sequence durationInFrames={SCENES.aiOps}>
          <AIOperationsScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />

        {/* Scene 5: Connector Learning */}
        <TransitionSeries.Sequence durationInFrames={SCENES.connector}>
          <ConnectorScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />

        {/* Scene 6: Chat with Data */}
        <TransitionSeries.Sequence durationInFrames={SCENES.chat}>
          <ChatScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />

        {/* Scene 7: Outro */}
        <TransitionSeries.Sequence durationInFrames={SCENES.outro}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}

/**
 * Calculate total composition duration accounting for transition overlaps.
 *
 * With TransitionSeries, each transition causes the adjacent scenes to overlap,
 * reducing the total duration by the transition length.
 */
export function calculateTotalDuration(): number {
  const sceneDurations = Object.values(SCENES);
  const totalSceneDuration = sceneDurations.reduce((sum, d) => sum + d, 0);
  const numTransitions = sceneDurations.length - 1;
  const totalTransitionOverlap = numTransitions * TRANSITION_FRAMES;

  return totalSceneDuration - totalTransitionOverlap;
}

// Export individual scenes for preview in Remotion Studio
export { ProblemScene } from '../scenes/ProblemScene';
export { InsightScene } from '../scenes/InsightScene';
export { ViewsScene } from '../scenes/ViewsScene';
export { AIOperationsScene } from '../scenes/AIOperationsScene';
export { ConnectorScene } from '../scenes/ConnectorScene';
export { ChatScene } from '../scenes/ChatScene';
export { OutroScene } from '../scenes/OutroScene';
