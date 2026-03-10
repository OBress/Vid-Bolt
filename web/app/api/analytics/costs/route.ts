/**
 * Analytics Cost API
 * GET — Aggregates costData from video_projects.metadata for the current user
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface CostEntry {
  service: string;
  model?: string;
  cost: number;
  tokens?: number;
  calls?: number;
}

interface CostData {
  totalCost?: number;
  entries?: CostEntry[];
  steps?: Record<string, { totalCost: number; entries: CostEntry[] }>;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get all video projects with costData
  const { data: projects, error } = await supabase
    .from('video_projects')
    .select('id, name, status, created_at, metadata')
    .eq('user_id', user.id)
    .not('metadata', 'is', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate cost data
  let totalCostAllProjects = 0;
  const costByService: Record<string, number> = {};
  const costByModel: Record<string, number> = {};
  const projectCosts: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
    totalCost: number;
    entries: CostEntry[];
  }> = [];

  // Cost trend by date
  const costByDate: Record<string, number> = {};

  for (const project of projects || []) {
    const costData = (project.metadata as Record<string, unknown>)?.costData as CostData | undefined;
    if (!costData) continue;

    const projectTotal = costData.totalCost || 0;
    totalCostAllProjects += projectTotal;

    // Date bucket
    const dateKey = project.created_at.split('T')[0];
    costByDate[dateKey] = (costByDate[dateKey] || 0) + projectTotal;

    // Collect all entries from steps
    const allEntries: CostEntry[] = [];
    if (costData.steps) {
      for (const step of Object.values(costData.steps)) {
        for (const entry of step.entries || []) {
          allEntries.push(entry);
          costByService[entry.service] = (costByService[entry.service] || 0) + entry.cost;
          if (entry.model) {
            costByModel[entry.model] = (costByModel[entry.model] || 0) + entry.cost;
          }
        }
      }
    } else if (costData.entries) {
      for (const entry of costData.entries) {
        allEntries.push(entry);
        costByService[entry.service] = (costByService[entry.service] || 0) + entry.cost;
        if (entry.model) {
          costByModel[entry.model] = (costByModel[entry.model] || 0) + entry.cost;
        }
      }
    }

    projectCosts.push({
      id: project.id,
      name: project.name,
      status: project.status,
      created_at: project.created_at,
      totalCost: projectTotal,
      entries: allEntries,
    });
  }

  // Sort cost trend by date
  const costTrend = Object.entries(costByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost: parseFloat(cost.toFixed(4)) }));

  return NextResponse.json({
    totalCost: parseFloat(totalCostAllProjects.toFixed(4)),
    projectCount: projectCosts.length,
    costByService: Object.entries(costByService)
      .map(([service, cost]) => ({ service, cost: parseFloat(cost.toFixed(4)) }))
      .sort((a, b) => b.cost - a.cost),
    costByModel: Object.entries(costByModel)
      .map(([model, cost]) => ({ model, cost: parseFloat(cost.toFixed(4)) }))
      .sort((a, b) => b.cost - a.cost),
    costTrend,
    projects: projectCosts.slice(0, 50), // Top 50 most recent
  });
}
