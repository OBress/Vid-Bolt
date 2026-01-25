import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';

export const dynamic = 'force-dynamic';

interface CheckResult {
  enabled: boolean;
  error?: string;
}

interface QuotaResult {
  available: boolean;
  quota: number;
  region?: string;
  error?: string;
}

interface CheckResponse {
  computeApi: CheckResult;
  youtubeApi: CheckResult;
  gpuQuota: QuotaResult;
  allPassing: boolean;
}

/**
 * Check if required GCP APIs are enabled and GPU quota is available
 */
export async function POST(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Get valid GCP token
    let accessToken: string;
    try {
      accessToken = await getValidGCPToken(user.id);
    } catch (tokenError) {
      return NextResponse.json(
        { error: 'GCP authentication required. Please reconnect your Google account.' },
        { status: 401 }
      );
    }

    const results: CheckResponse = {
      computeApi: { enabled: false },
      youtubeApi: { enabled: false },
      gpuQuota: { available: false, quota: 0 },
      allPassing: false,
    };

    // 1. Check Compute Engine API by listing zones (simple, read-only call)
    try {
      const computeRes = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones?maxResults=1`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (computeRes.ok) {
        results.computeApi.enabled = true;
      } else {
        const errorData = await computeRes.json();
        
        if (computeRes.status === 403 && errorData.error?.message?.includes('has not been used')) {
          results.computeApi.error = 'Compute Engine API is not enabled';
        } else if (computeRes.status === 403) {
          results.computeApi.error = 'Access denied - check project permissions';
        } else {
          results.computeApi.error = errorData.error?.message || 'API check failed';
        }
      }
    } catch (e) {
      results.computeApi.error = 'Failed to check Compute Engine API';
    }

    // 2. Check YouTube Data API by listing video categories (only 1 quota unit!)
    try {
      const youtubeRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=US`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (youtubeRes.ok) {
        results.youtubeApi.enabled = true;
      } else {
        const errorData = await youtubeRes.json();
        
        if (errorData.error?.errors?.[0]?.reason === 'accessNotConfigured') {
          results.youtubeApi.error = 'YouTube Data API V3 is not enabled';
        } else if (youtubeRes.status === 403) {
          results.youtubeApi.error = errorData.error?.message || 'Access denied';
        } else {
          results.youtubeApi.error = errorData.error?.message || 'API check failed';
        }
      }
    } catch (e) {
      results.youtubeApi.error = 'Failed to check YouTube Data API';
    }

    // 3. Check GPU Quota (check us-central1 as primary region)
    const GPU_REGIONS = ['us-central1', 'us-west1', 'us-east1', 'europe-west4'];
    
    for (const region of GPU_REGIONS) {
      try {
        const quotaRes = await fetch(
          `https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${region}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (quotaRes.ok) {
          const data = await quotaRes.json();
          // Look for NVIDIA GPU quotas
          const gpuQuotas = (data.quotas || []).filter((q: any) => 
            q.metric?.includes('NVIDIA') || q.metric?.includes('GPU')
          );

          for (const quota of gpuQuotas) {
            if (quota.limit > 0) {
              results.gpuQuota = {
                available: true,
                quota: quota.limit,
                region: region,
              };
              break;
            }
          }

          if (results.gpuQuota.available) break;
        }
      } catch (e) {
        // Continue checking other regions
      }
    }

    if (!results.gpuQuota.available) {
      results.gpuQuota.error = 'No GPU quota found. Request quota increase in GCP Console.';
    }

    // Determine if all checks pass
    results.allPassing = 
      results.computeApi.enabled && 
      results.youtubeApi.enabled && 
      results.gpuQuota.available;

    return NextResponse.json(results);
  } catch (error) {
    console.error('[GCP Check] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Check failed' },
      { status: 500 }
    );
  }
}
