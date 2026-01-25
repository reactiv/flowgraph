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
import { MockKanban } from '../components/MockKanban';
import { MockGraph } from '../components/MockGraph';
import { MockGantt } from '../components/MockGantt';
import { MockTimeline } from '../components/MockTimeline';
import { MockCards } from '../components/MockCards';

/**
 * Scene 3: Views - Universal Visualization (15s, frames 360-810)
 * "Visualize any workflow, any way you need"
 *
 * Rapid showcase of the SAME underlying graph rendered as different views.
 * Each view lasts 3s (90 frames) with morphing transitions.
 */

const VIEW_DURATION = 90; // 3 seconds at 30fps

/**
 * Wrapper component to center view content within Sequence
 */
function ViewWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      {children}
    </div>
  );
}

export function ViewsScene() {
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

  // Current view index
  const viewIndex = Math.floor(frame / VIEW_DURATION);
  const viewFrame = frame % VIEW_DURATION;

  // View labels
  const viewLabels = [
    { name: 'Kanban', domain: 'Clinical Trial' },
    { name: 'Graph', domain: 'Lab Sample Tracking' },
    { name: 'Gantt', domain: 'Manufacturing Line' },
    { name: 'Timeline', domain: 'Equipment Maintenance' },
    { name: 'Cards', domain: 'R&D Projects' },
  ];

  const currentView = viewLabels[Math.min(viewIndex, viewLabels.length - 1)];

  // View transition (fade in/out at boundaries)
  const viewTransition =
    viewFrame < 15
      ? interpolate(viewFrame, [0, 15], [0, 1])
      : viewFrame > VIEW_DURATION - 15
        ? interpolate(viewFrame, [VIEW_DURATION - 15, VIEW_DURATION], [1, 0])
        : 1;

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
            marginBottom: 8,
          }}
        >
          Visualize any workflow,{' '}
          <span style={{ color: colors.primary }}>any way you need</span>
        </h1>
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 18,
            color: colors.mutedForeground,
          }}
        >
          Same data, different perspectives
        </div>
      </div>

      {/* View label badge */}
      <div
        style={{
          position: 'absolute',
          top: 140,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          opacity: viewTransition,
          zIndex: 10,
        }}
      >
        <div
          style={{
            backgroundColor: colors.primary,
            color: colors.background,
            fontFamily: fonts.heading,
            fontSize: 14,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 20,
          }}
        >
          {currentView.name} View
        </div>
        <div
          style={{
            color: colors.mutedForeground,
            fontFamily: fonts.body,
            fontSize: 14,
          }}
        >
          {currentView.domain}
        </div>
      </div>

      {/* View content */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: 0,
          right: 0,
          bottom: 40,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          opacity: viewTransition,
        }}
      >
        {/* Kanban View - Clinical Trial */}
        <Sequence from={0} durationInFrames={VIEW_DURATION} premountFor={fps}>
          <ViewWrapper>
            <KanbanViewContent />
          </ViewWrapper>
        </Sequence>

        {/* Graph View - Lab Sample */}
        <Sequence from={VIEW_DURATION} durationInFrames={VIEW_DURATION} premountFor={fps}>
          <ViewWrapper>
            <GraphViewContent />
          </ViewWrapper>
        </Sequence>

        {/* Gantt View - Manufacturing */}
        <Sequence from={VIEW_DURATION * 2} durationInFrames={VIEW_DURATION} premountFor={fps}>
          <ViewWrapper>
            <GanttViewContent />
          </ViewWrapper>
        </Sequence>

        {/* Timeline View - Equipment */}
        <Sequence from={VIEW_DURATION * 3} durationInFrames={VIEW_DURATION} premountFor={fps}>
          <ViewWrapper>
            <TimelineViewContent />
          </ViewWrapper>
        </Sequence>

        {/* Cards View - R&D */}
        <Sequence from={VIEW_DURATION * 4} durationInFrames={VIEW_DURATION} premountFor={fps}>
          <ViewWrapper>
            <CardsViewContent />
          </ViewWrapper>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
}

function KanbanViewContent() {
  const columns = [
    {
      title: 'Enrolled',
      color: colors.pending,
      cards: [
        { title: 'Patient #1042', subtitle: 'Week 1', status: 'Screening' },
        { title: 'Patient #1043', subtitle: 'Week 1', status: 'Screening' },
      ],
    },
    {
      title: 'Active',
      color: colors.info,
      cards: [
        { title: 'Patient #1038', subtitle: 'Week 8', status: 'On Track' },
        { title: 'Patient #1039', subtitle: 'Week 6', status: 'On Track' },
        { title: 'Patient #1040', subtitle: 'Week 4', status: 'Review' },
      ],
    },
    {
      title: 'Follow-up',
      color: colors.warning,
      cards: [
        { title: 'Patient #1035', subtitle: 'Week 12', status: 'Scheduled' },
      ],
    },
    {
      title: 'Completed',
      color: colors.success,
      cards: [
        { title: 'Patient #1030', subtitle: 'Week 16', status: 'Complete' },
        { title: 'Patient #1031', subtitle: 'Week 16', status: 'Complete' },
      ],
    },
  ];

  return <MockKanban columns={columns} delay={0.1} />;
}

function GraphViewContent() {
  const nodes = [
    { id: 'sample1', label: 'Sample BX-2847', type: 'Sample', x: 100, y: 150, color: colors.emerald },
    { id: 'sample2', label: 'Sample BX-2848', type: 'Sample', x: 100, y: 350, color: colors.emerald },
    { id: 'analysis1', label: 'HPLC Analysis', type: 'Analysis', x: 400, y: 100, color: colors.amber },
    { id: 'analysis2', label: 'Mass Spec', type: 'Analysis', x: 400, y: 250, color: colors.amber },
    { id: 'analysis3', label: 'NMR', type: 'Analysis', x: 400, y: 400, color: colors.amber },
    { id: 'result1', label: 'Purity: 99.2%', type: 'Result', x: 700, y: 150, color: colors.violet },
    { id: 'result2', label: 'Mass: 342.4', type: 'Result', x: 700, y: 300, color: colors.violet },
    { id: 'report', label: 'QC Report #892', type: 'Report', x: 950, y: 220, color: colors.pink },
  ];

  const edges = [
    { from: 'sample1', to: 'analysis1', label: 'analyzed' },
    { from: 'sample1', to: 'analysis2' },
    { from: 'sample2', to: 'analysis2' },
    { from: 'sample2', to: 'analysis3', label: 'analyzed' },
    { from: 'analysis1', to: 'result1' },
    { from: 'analysis2', to: 'result2', label: 'produced' },
    { from: 'result1', to: 'report' },
    { from: 'result2', to: 'report', label: 'documented' },
  ];

  return <MockGraph nodes={nodes} edges={edges} delay={0.1} nodeSize={70} />;
}

function GanttViewContent() {
  const tasks = [
    { id: '1', label: 'Raw Material QC', start: 0, duration: 20, color: colors.emerald, progress: 100 },
    { id: '2', label: 'Batch Mixing', start: 15, duration: 25, color: colors.amber, progress: 80 },
    { id: '3', label: 'Granulation', start: 35, duration: 20, color: colors.violet, progress: 40 },
    { id: '4', label: 'Compression', start: 50, duration: 25, color: colors.pink, progress: 0 },
    { id: '5', label: 'Coating', start: 70, duration: 15, color: colors.teal, progress: 0 },
    { id: '6', label: 'Final QC', start: 80, duration: 18, color: colors.primary, progress: 0 },
  ];

  return <MockGantt tasks={tasks} delay={0.1} />;
}

function TimelineViewContent() {
  const events = [
    {
      id: '1',
      title: 'Annual Calibration',
      date: 'Jan 15, 2024',
      description: 'Centrifuge #CF-204 scheduled maintenance',
      status: 'Complete',
      color: colors.success,
    },
    {
      id: '2',
      title: 'Filter Replacement',
      date: 'Feb 3, 2024',
      description: 'HEPA filters replaced in cleanroom HVAC',
      status: 'Complete',
      color: colors.success,
    },
    {
      id: '3',
      title: 'Motor Inspection',
      date: 'Mar 20, 2024',
      description: 'Quarterly motor bearing check',
      status: 'In Progress',
      color: colors.info,
    },
    {
      id: '4',
      title: 'Software Update',
      date: 'Apr 5, 2024',
      description: 'LIMS system upgrade to v4.2',
      status: 'Scheduled',
      color: colors.warning,
    },
  ];

  return <MockTimeline events={events} delay={0.1} />;
}

function CardsViewContent() {
  const cards = [
    {
      id: '1',
      title: 'CMP-4892-A',
      subtitle: 'Lead optimization series',
      status: 'Active',
      color: colors.emerald,
      metrics: [
        { label: 'Assays', value: '24' },
        { label: 'IC50', value: '12.4 nM' },
      ],
      tags: ['Oncology', 'Phase 1'],
    },
    {
      id: '2',
      title: 'CMP-5103-B',
      subtitle: 'Hit-to-lead candidate',
      status: 'In Progress',
      color: colors.amber,
      metrics: [
        { label: 'Assays', value: '18' },
        { label: 'IC50', value: '45.2 nM' },
      ],
      tags: ['Immunology', 'Discovery'],
    },
    {
      id: '3',
      title: 'CMP-4721-C',
      subtitle: 'Backup compound',
      status: 'Pending Review',
      color: colors.violet,
      metrics: [
        { label: 'Assays', value: '31' },
        { label: 'IC50', value: '8.7 nM' },
      ],
      tags: ['Oncology', 'Phase 2'],
    },
    {
      id: '4',
      title: 'CMP-5289-A',
      subtitle: 'Novel scaffold',
      status: 'Planned',
      color: colors.pink,
      metrics: [
        { label: 'Assays', value: '6' },
        { label: 'IC50', value: 'TBD' },
      ],
      tags: ['CNS', 'Discovery'],
    },
    {
      id: '5',
      title: 'CMP-4655-D',
      subtitle: 'Prodrug variant',
      status: 'Complete',
      color: colors.success,
      metrics: [
        { label: 'Assays', value: '42' },
        { label: 'IC50', value: '5.1 nM' },
      ],
      tags: ['Oncology', 'Phase 3'],
    },
    {
      id: '6',
      title: 'CMP-5401-B',
      subtitle: 'Metabolite study',
      status: 'Active',
      color: colors.teal,
      metrics: [
        { label: 'Assays', value: '12' },
        { label: 'IC50', value: '22.8 nM' },
      ],
      tags: ['Cardio', 'Discovery'],
    },
  ];

  return <MockCards cards={cards} columns={3} delay={0.1} />;
}
