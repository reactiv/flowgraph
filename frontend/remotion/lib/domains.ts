import { colors } from './theme';

/**
 * Domain-specific mock data for the sizzle video.
 * Used to show realistic workflow examples across different industries.
 */

export type DomainKey =
  | 'clinicalTrial'
  | 'labSample'
  | 'manufacturingQC'
  | 'equipmentMaintenance'
  | 'semiconductorFab'
  | 'biotechRD'
  | 'supplyChain';

export interface DomainData {
  name: string;
  nodeTypes: string[];
  statuses: string[];
  color: string;
  icon: string;
  sampleNodes: Array<{
    title: string;
    type: string;
    status: string;
  }>;
  sampleEdges: Array<{
    label: string;
    from: string;
    to: string;
  }>;
}

export const domains: Record<DomainKey, DomainData> = {
  clinicalTrial: {
    name: 'Clinical Trial',
    nodeTypes: ['Patient', 'Visit', 'Adverse Event', 'Lab Result'],
    statuses: ['Enrolled', 'Active', 'Completed', 'Withdrawn'],
    color: colors.cyan,
    icon: 'stethoscope',
    sampleNodes: [
      { title: 'Patient #1042', type: 'Patient', status: 'Active' },
      { title: 'Week 4 Visit', type: 'Visit', status: 'Completed' },
      { title: 'Mild Headache', type: 'Adverse Event', status: 'Resolved' },
      { title: 'CBC Panel', type: 'Lab Result', status: 'Pending Review' },
    ],
    sampleEdges: [
      { label: 'scheduled_for', from: 'Patient', to: 'Visit' },
      { label: 'reported', from: 'Visit', to: 'Adverse Event' },
      { label: 'resulted_in', from: 'Visit', to: 'Lab Result' },
    ],
  },
  labSample: {
    name: 'Lab Sample Tracking',
    nodeTypes: ['Sample', 'Analysis', 'Result', 'Report'],
    statuses: ['Collected', 'Processing', 'Analyzed', 'Released'],
    color: colors.emerald,
    icon: 'flask',
    sampleNodes: [
      { title: 'Sample BX-2847', type: 'Sample', status: 'Processing' },
      { title: 'HPLC Analysis', type: 'Analysis', status: 'In Progress' },
      { title: 'Purity: 99.2%', type: 'Result', status: 'Validated' },
      { title: 'QC Report #892', type: 'Report', status: 'Draft' },
    ],
    sampleEdges: [
      { label: 'analyzed_by', from: 'Sample', to: 'Analysis' },
      { label: 'produced', from: 'Analysis', to: 'Result' },
      { label: 'documented_in', from: 'Result', to: 'Report' },
    ],
  },
  manufacturingQC: {
    name: 'Manufacturing QC',
    nodeTypes: ['Batch', 'QC Check', 'Deviation', 'Release'],
    statuses: ['In Progress', 'Pending Review', 'Approved', 'Rejected'],
    color: colors.amber,
    icon: 'factory',
    sampleNodes: [
      { title: 'Batch LOT-2024-089', type: 'Batch', status: 'In Progress' },
      { title: 'Visual Inspection', type: 'QC Check', status: 'Pass' },
      { title: 'DEV-2024-012', type: 'Deviation', status: 'Under Investigation' },
      { title: 'Batch Release', type: 'Release', status: 'Pending Review' },
    ],
    sampleEdges: [
      { label: 'requires', from: 'Batch', to: 'QC Check' },
      { label: 'triggered', from: 'QC Check', to: 'Deviation' },
      { label: 'blocks', from: 'Deviation', to: 'Release' },
    ],
  },
  equipmentMaintenance: {
    name: 'Equipment Maintenance',
    nodeTypes: ['Asset', 'Service Event', 'Work Order', 'Part'],
    statuses: ['Operational', 'Scheduled', 'In Service', 'Down'],
    color: colors.orange,
    icon: 'wrench',
    sampleNodes: [
      { title: 'Centrifuge #CF-204', type: 'Asset', status: 'Operational' },
      { title: 'Annual Calibration', type: 'Service Event', status: 'Scheduled' },
      { title: 'WO-2024-1847', type: 'Work Order', status: 'Open' },
      { title: 'Rotor Assembly', type: 'Part', status: 'On Order' },
    ],
    sampleEdges: [
      { label: 'scheduled_for', from: 'Asset', to: 'Service Event' },
      { label: 'created', from: 'Service Event', to: 'Work Order' },
      { label: 'requires', from: 'Work Order', to: 'Part' },
    ],
  },
  semiconductorFab: {
    name: 'Semiconductor Fab',
    nodeTypes: ['Wafer Lot', 'Process Step', 'Measurement', 'Defect'],
    statuses: ['Queued', 'Running', 'Complete', 'On Hold'],
    color: colors.violet,
    icon: 'cpu',
    sampleNodes: [
      { title: 'Lot W-2024-0892', type: 'Wafer Lot', status: 'Running' },
      { title: 'Photolithography', type: 'Process Step', status: 'Complete' },
      { title: 'CD Measurement', type: 'Measurement', status: 'Pass' },
      { title: 'Particle Defect', type: 'Defect', status: 'Under Review' },
    ],
    sampleEdges: [
      { label: 'undergoes', from: 'Wafer Lot', to: 'Process Step' },
      { label: 'verified_by', from: 'Process Step', to: 'Measurement' },
      { label: 'detected', from: 'Measurement', to: 'Defect' },
    ],
  },
  biotechRD: {
    name: 'Biotech R&D',
    nodeTypes: ['Compound', 'Assay', 'Experiment', 'Result'],
    statuses: ['Planned', 'Active', 'Complete', 'Archived'],
    color: colors.pink,
    icon: 'dna',
    sampleNodes: [
      { title: 'CMP-4892-A', type: 'Compound', status: 'Active' },
      { title: 'Cell Viability', type: 'Assay', status: 'Running' },
      { title: 'EXP-2024-0234', type: 'Experiment', status: 'Complete' },
      { title: 'IC50: 12.4 nM', type: 'Result', status: 'Validated' },
    ],
    sampleEdges: [
      { label: 'tested_in', from: 'Compound', to: 'Assay' },
      { label: 'part_of', from: 'Assay', to: 'Experiment' },
      { label: 'produced', from: 'Experiment', to: 'Result' },
    ],
  },
  supplyChain: {
    name: 'Supply Chain',
    nodeTypes: ['Purchase Order', 'Shipment', 'Inventory', 'Vendor'],
    statuses: ['Pending', 'Shipped', 'Received', 'Cancelled'],
    color: colors.teal,
    icon: 'truck',
    sampleNodes: [
      { title: 'PO-2024-8921', type: 'Purchase Order', status: 'Approved' },
      { title: 'SHP-2024-4521', type: 'Shipment', status: 'In Transit' },
      { title: 'Raw Material A', type: 'Inventory', status: 'Low Stock' },
      { title: 'Acme Supplies', type: 'Vendor', status: 'Active' },
    ],
    sampleEdges: [
      { label: 'placed_with', from: 'Purchase Order', to: 'Vendor' },
      { label: 'fulfilled_by', from: 'Purchase Order', to: 'Shipment' },
      { label: 'replenishes', from: 'Shipment', to: 'Inventory' },
    ],
  },
};

/**
 * Get a list of domain keys in a specific order (for variety in video).
 */
export function getDomainRotation(): DomainKey[] {
  return [
    'clinicalTrial',
    'labSample',
    'manufacturingQC',
    'semiconductorFab',
    'biotechRD',
    'equipmentMaintenance',
    'supplyChain',
  ];
}

/**
 * Get status color based on status text.
 */
export function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();

  if (
    statusLower.includes('complete') ||
    statusLower.includes('pass') ||
    statusLower.includes('validated') ||
    statusLower.includes('approved') ||
    statusLower.includes('active') ||
    statusLower.includes('operational')
  ) {
    return colors.success;
  }
  if (
    statusLower.includes('pending') ||
    statusLower.includes('review') ||
    statusLower.includes('scheduled') ||
    statusLower.includes('draft') ||
    statusLower.includes('open')
  ) {
    return colors.warning;
  }
  if (
    statusLower.includes('fail') ||
    statusLower.includes('reject') ||
    statusLower.includes('down') ||
    statusLower.includes('hold')
  ) {
    return colors.error;
  }
  if (
    statusLower.includes('progress') ||
    statusLower.includes('running') ||
    statusLower.includes('processing')
  ) {
    return colors.info;
  }

  return colors.pending;
}
