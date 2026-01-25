import { Composition, Folder } from 'remotion';
import {
  SizzleVideo,
  calculateTotalDuration,
  ProblemScene,
  InsightScene,
  ViewsScene,
  AIOperationsScene,
  ConnectorScene,
  ChatScene,
  OutroScene,
} from './compositions/SizzleVideo';

// Video specifications
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Scene durations for individual preview
const SCENE_DURATIONS = {
  problem: 180,
  insight: 180,
  views: 450,
  aiOps: 300,
  connector: 360,
  chat: 180,
  outro: 150,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main composition - full video */}
      <Composition
        id="SizzleVideo"
        component={SizzleVideo}
        durationInFrames={calculateTotalDuration()}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* Individual scenes for preview/development */}
      <Folder name="Scenes">
        <Composition
          id="Scene1-Problem"
          component={ProblemScene}
          durationInFrames={SCENE_DURATIONS.problem}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />

        <Composition
          id="Scene2-Insight"
          component={InsightScene}
          durationInFrames={SCENE_DURATIONS.insight}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />

        <Composition
          id="Scene3-Views"
          component={ViewsScene}
          durationInFrames={SCENE_DURATIONS.views}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />

        <Composition
          id="Scene4-AIOperations"
          component={AIOperationsScene}
          durationInFrames={SCENE_DURATIONS.aiOps}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />

        <Composition
          id="Scene5-Connector"
          component={ConnectorScene}
          durationInFrames={SCENE_DURATIONS.connector}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />

        <Composition
          id="Scene6-Chat"
          component={ChatScene}
          durationInFrames={SCENE_DURATIONS.chat}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />

        <Composition
          id="Scene7-Outro"
          component={OutroScene}
          durationInFrames={SCENE_DURATIONS.outro}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
      </Folder>
    </>
  );
};
