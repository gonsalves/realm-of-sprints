import { DataAdapter } from './DataAdapter.js';

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const PEOPLE = [
  { id: 'seed-1', name: 'Aprajit Kar', role: 'Associate Director, Product Design - UX', color: '#D4C4B0' },
  { id: 'seed-2', name: 'Atul Kumar', role: 'Associate Director, Product Design', color: '#BFC0C5' },
  { id: 'seed-3', name: 'Elson Jithesh Dsouza', role: 'Product Design Manager', color: '#C8BDA8' },
  { id: 'seed-4', name: 'Sindhu Shivaprasad', role: 'Lead Product Content Designer', color: '#ADB0B5' },
  { id: 'seed-5', name: 'Surabhi Vinod Manchalwar', role: 'Product Design Manager', color: '#D0C0A8' },
  { id: 'seed-6', name: 'Yugendran Muthuvel', role: 'Design Head, Share.Market', color: '#B5B8A8' },
];

const TASKS = [
  {
    id: 'task-1a', name: 'Design System Overhaul', assigneeId: 'seed-1',
    description: 'Restructure core design system components and tokens',
    category: 'Design', stage: 'building', size: 'large',
    discoveryPercent: 35, executionPercent: 65,
    expectedDate: daysFromNow(14), percentComplete: 55, milestoneId: 'ms-1',
  },
  {
    id: 'task-1b', name: 'UX Audit', assigneeId: 'seed-1',
    description: 'Audit existing user flows for friction points',
    category: 'Research', stage: 'exploration', size: 'medium',
    discoveryPercent: 70, executionPercent: 30,
    expectedDate: daysFromNow(7), percentComplete: 20, milestoneId: 'ms-1',
  },
  {
    id: 'task-2a', name: 'User Research Sprint', assigneeId: 'seed-2',
    description: 'Conduct user interviews and synthesize findings',
    category: 'Research', stage: 'exploration', size: 'large',
    discoveryPercent: 85, executionPercent: 15,
    expectedDate: daysFromNow(-5), percentComplete: 40, milestoneId: 'ms-1',
  },
  {
    id: 'task-2b', name: 'Component Library v3', assigneeId: 'seed-2',
    description: 'Update component library with new patterns',
    category: 'Engineering', stage: 'building', size: 'large',
    discoveryPercent: 20, executionPercent: 80,
    expectedDate: daysFromNow(21), percentComplete: 10, milestoneId: 'ms-2',
  },
  {
    id: 'task-3a', name: 'Dashboard Redesign', assigneeId: 'seed-3',
    description: 'Rebuild analytics dashboard with new visual language',
    category: 'Design', stage: 'building', size: 'medium',
    discoveryPercent: 15, executionPercent: 85,
    expectedDate: daysFromNow(10), percentComplete: 72, milestoneId: 'ms-2',
  },
  {
    id: 'task-4a', name: 'Content Strategy Research', assigneeId: 'seed-4',
    description: 'Research content patterns and voice guidelines',
    category: 'Research', stage: 'exploration', size: 'medium',
    discoveryPercent: 75, executionPercent: 25,
    expectedDate: daysFromNow(-10), percentComplete: 30, milestoneId: 'ms-1',
  },
  {
    id: 'task-4b', name: 'Microcopy Overhaul', assigneeId: 'seed-4',
    description: 'Rewrite error messages and empty states across product',
    category: 'Content', stage: 'documenting', size: 'medium',
    discoveryPercent: 40, executionPercent: 60,
    expectedDate: daysFromNow(5), percentComplete: 15, milestoneId: 'ms-2',
  },
  {
    id: 'task-5a', name: 'Onboarding Flow Redesign', assigneeId: 'seed-5',
    description: 'Redesign first-time user onboarding experience',
    category: 'Design', stage: 'sharing', size: 'large',
    discoveryPercent: 25, executionPercent: 75,
    expectedDate: daysFromNow(3), percentComplete: 65, milestoneId: 'ms-2',
  },
  {
    id: 'task-6a', name: 'Share.Market Visual Refresh', assigneeId: 'seed-6',
    description: 'Lead visual design refresh for Share.Market platform',
    category: 'Design', stage: 'ideating', size: 'large',
    discoveryPercent: 70, executionPercent: 30,
    expectedDate: daysFromNow(2), percentComplete: 50, milestoneId: 'ms-1',
  },
  {
    id: 'task-6b', name: 'Competitive Analysis', assigneeId: 'seed-6',
    description: 'Deep dive on competitor trading platform UX',
    category: 'Research', stage: 'presenting', size: 'small',
    discoveryPercent: 90, executionPercent: 10,
    expectedDate: daysFromNow(-3), percentComplete: 60, milestoneId: null,
  },
];

const MILESTONES = [
  { id: 'ms-1', name: 'Q1 Design Sprint', taskIds: ['task-1a', 'task-1b', 'task-2a', 'task-4a', 'task-6a'] },
  { id: 'ms-2', name: 'v3 Platform Release', taskIds: ['task-2b', 'task-3a', 'task-4b', 'task-5a'] },
];

export class SeedAdapter extends DataAdapter {
  async fetchPeople() {
    return JSON.parse(JSON.stringify(PEOPLE));
  }

  async fetchTasks() {
    return JSON.parse(JSON.stringify(TASKS));
  }

  async fetchMilestones() {
    return JSON.parse(JSON.stringify(MILESTONES));
  }

  async fetchResourceTypes() {
    const categories = new Set(TASKS.map(t => t.category).filter(Boolean));
    return [...categories];
  }

  async sync() {
    // No-op for seed data
  }
}
