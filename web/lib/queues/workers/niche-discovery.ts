/**
 * Niche Discovery Worker
 * 
 * BullMQ processor that discovers channels in the user's niche using AI:
 * 1. Fetch user's channel profile (description + recent videos + tags)
 * 2. Crawl featured channels from user's channel + competitors
 * 3. Search YouTube for related channels via keywords & topics
 * 4. Expand network via snowball sampling (featured channels of top matches)
 * 5. Compute embedding-based cosine similarity for each candidate
 * 6. Compute video tag Jaccard overlap
 * 7. Use Gemini 3 Flash for contextual AI similarity analysis
 * 8. Combine all signals into a multi-signal weighted score
 * 9. Store results in niche_network_channels + niche_network_edges
 */

import { Job } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { getValidYouTubeToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';
import { callOpenRouter, type OpenRouterMessage } from '@/lib/ai/openrouter';
import { generateEmbedding } from '@/lib/ai/embedding';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ---------------------------------------------------------------------------
// Task Progress Helper
// ---------------------------------------------------------------------------

const NICHE_STEPS = [
  'channel_profiling', 'channel_crawling', 'keyword_search', 'enrichment',
  'snowball_expansion', 'embedding_similarity', 'ai_analysis', 'scoring', 'storing_results',
];

async function updateTaskProgress(
  supabase: ReturnType<typeof getServiceSupabase>,
  taskId: string | undefined,
  stepId: string,
  stepLabel: string,
  status: 'running' | 'completed' | 'failed' = 'running'
): Promise<void> {
  if (!taskId) return;
  try {
    const stepIndex = NICHE_STEPS.indexOf(stepId);
    const progress = status === 'completed'
      ? Math.round(((stepIndex + 1) / NICHE_STEPS.length) * 100)
      : Math.round((stepIndex / NICHE_STEPS.length) * 100);

    // Build updated steps array
    const steps = NICHE_STEPS.map((id, i) => {
      let s: string;
      if (i < stepIndex) s = 'completed';
      else if (i === stepIndex) s = status;
      else s = 'pending';
      return {
        id,
        name: stepLabel,
        phase: id,
        order: i + 1,
        status: s,
        ...(s === 'running' ? { started_at: new Date().toISOString() } : {}),
        ...(s === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      };
    });

    await supabase
      .from('tasks')
      .update({
        status: 'running',
        current_phase: stepId,
        current_step: stepLabel,
        progress_percent: progress,
        started_at: stepIndex === 0 ? new Date().toISOString() : undefined,
        steps,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  } catch (err) {
    console.warn('[NicheDiscovery] Failed to update task progress:', err);
  }
}

async function completeTask(
  supabase: ReturnType<typeof getServiceSupabase>,
  taskId: string | undefined,
  status: 'completed' | 'failed',
  errorMessage?: string
): Promise<void> {
  if (!taskId) return;
  try {
    const finalSteps = NICHE_STEPS.map((id, i) => ({
      id,
      name: id.replaceAll('_', ' '),
      phase: id,
      order: i + 1,
      status: status === 'completed' ? 'completed' : (i < NICHE_STEPS.length ? 'failed' : 'pending'),
      completed_at: new Date().toISOString(),
    }));

    await supabase
      .from('tasks')
      .update({
        status,
        progress_percent: status === 'completed' ? 100 : 0,
        completed_at: new Date().toISOString(),
        error_message: errorMessage || null,
        steps: finalSteps,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  } catch (err) {
    console.warn('[NicheDiscovery] Failed to complete task:', err);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveredChannel {
  channelId: string;
  title: string;
  handle?: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  recentVideoTitles: string[];
  recentVideoTags: string[];
  topicCategories: string[];
  discoveryMethod: 'keyword_search' | 'featured_channel' | 'expansion' | 'topic_match';
}

interface AISimilarityResult {
  channelId: string;
  similarity: number;
  sharedTopics: string[];
  contentStyle: string;
  cluster: number;
  reason: string;
  sharedAudience: string;
}

interface MultiSignalScore {
  channelId: string;
  finalScore: number;
  embeddingSimilarity: number;
  aiSimilarity: number;
  tagOverlap: number;
  discoveryMethodBonus: number;
  topicCategoryMatch: number;
  aiReason: string;
  aiSharedAudience: string;
  aiSharedTopics: string[];
  aiCluster: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/** Compute Jaccard similarity between two string arrays */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map(s => s.toLowerCase()));
  const setB = new Set(b.map(s => s.toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Build a text profile of a channel for AI analysis and embedding */
async function buildChannelProfile(
  api: YouTubeApi,
  channelYtId: string,
  channelTitle: string,
  maxVideos = 20
): Promise<{
  description: string;
  videoTitles: string[];
  videoTags: string[];
  keywords: string[];
  topicCategories: string[];
}> {
  let description = '';
  const videoTitles: string[] = [];
  const videoTags: string[] = [];
  const keywords: string[] = [];
  let topicCategories: string[] = [];

  try {
    // Get channel description + topic categories + featured channels
    const details = await api.getChannelById(channelYtId);
    if (details) {
      description = details.description || '';
      topicCategories = details.topicCategories || [];
    }
  } catch {
    // Continue without description
  }

  try {
    // Get recent video titles
    const uploadsPlaylistId = channelYtId.startsWith('UC')
      ? 'UU' + channelYtId.slice(2)
      : channelYtId;
    const result = await api.getChannelVideos(uploadsPlaylistId, maxVideos);
    
    // Get video IDs for detailed tags
    const videoIds = result.items.map(v => v.videoId);
    for (const v of result.items) {
      videoTitles.push(v.title);
    }

    // Fetch video details for tags (batch up to 50)
    if (videoIds.length > 0) {
      try {
        const videoDetails = await api.getMultipleVideoDetails(videoIds.slice(0, 50));
        for (const v of videoDetails) {
          if (v.tags) {
            videoTags.push(...v.tags);
          }
        }
      } catch {
        // Skip tag fetching failures
      }
    }

    // Extract basic keywords for search queries
    const allText = videoTitles.join(' ').toLowerCase();
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was',
      'be', 'has', 'had', 'have', 'will', 'do', 'not', 'no', 'so', 'if',
      'my', 'me', 'we', 'you', 'your', 'our', 'i', 'he', 'she', 'they',
      'about', 'how', 'what', 'when', 'where', 'why', 'which', 'who',
      'can', 'just', 'more', 'most', 'very', 'much', 'all', 'new', 'one',
      'like', 'get', 'got', 'been', 'make', 'made', 'way', 'out', 'up',
      'video', 'subscribe', 'channel', 'watch', 'click', 'link', 'below',
    ]);
    const wordFreq: Record<string, number> = {};
    const words = allText.replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    for (const word of words) {
      if (word.length < 3 || word.length > 30 || stopWords.has(word)) continue;
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
    const sorted = Object.entries(wordFreq)
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20);
    keywords.push(...sorted.map(([w]) => w));
  } catch (err) {
    console.error('[NicheDiscovery] Failed to build profile:', err);
  }

  // Deduplicate tags
  const uniqueTags = [...new Set(videoTags.map(t => t.toLowerCase()))];

  return { description, videoTitles, videoTags: uniqueTags, keywords, topicCategories };
}

/** Build a text string for embedding from channel profile */
function buildEmbeddingText(
  title: string,
  description: string,
  videoTitles: string[],
  tags: string[]
): string {
  const parts = [
    `Channel: ${title}`,
    description.slice(0, 300),
    `Videos: ${videoTitles.slice(0, 10).join('; ')}`,
    tags.length > 0 ? `Tags: ${tags.slice(0, 20).join(', ')}` : '',
  ].filter(Boolean);
  return parts.join('\n').slice(0, 1500); // Keep under embedding model limits
}

/** Use Gemini 3 Flash to analyze similarity (smaller batches, structured criteria) */
async function analyzeWithAI(
  userId: string,
  userProfile: { title: string; description: string; videoTitles: string[] },
  candidates: DiscoveredChannel[]
): Promise<AISimilarityResult[]> {
  if (candidates.length === 0) return [];

  const candidateList = candidates.map((ch, i) => 
    `${i + 1}. "${ch.title}" (${ch.subscriberCount.toLocaleString()} subs)
   Description: ${(ch.description || 'N/A').slice(0, 200)}
   Recent videos: ${ch.recentVideoTitles.slice(0, 5).join('; ') || 'N/A'}
   Tags: ${ch.recentVideoTags.slice(0, 10).join(', ') || 'N/A'}`
  ).join('\n\n');

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are a YouTube channel similarity analyst. Given a user's channel profile and a list of candidate channels, analyze how similar each candidate is to the user's channel.

For each candidate, provide:
- similarity: 0.0-1.0 (how related the content/audience is — be generous for genuinely related channels)  
- sharedTopics: array of shared content themes/topics
- contentStyle: brief description of what they have in common
- cluster: group number (0-7) clustering semantically similar candidates together
- reason: 2-3 sentences explaining WHY this channel is similar or different. Be specific — mention content format, audience type, topic overlap, and production style.
- sharedAudience: 1 sentence describing the shared target audience (e.g., "Tech enthusiasts aged 18-35 interested in gadget reviews")

Scoring guidelines:
- 0.7-1.0: Nearly identical niche, same content format, same audience
- 0.5-0.7: Same broad niche, overlapping audience, similar content style
- 0.3-0.5: Related niche, some audience overlap, different angle
- 0.1-0.3: Tangentially related, minimal audience overlap
- 0.0-0.1: Unrelated

Return valid JSON array. Be accurate and useful.`
    },
    {
      role: 'user',
      content: `## My Channel: "${userProfile.title}"
Description: ${(userProfile.description || 'N/A').slice(0, 500)}
Recent videos: ${userProfile.videoTitles.slice(0, 10).join('; ')}

## Candidate Channels:
${candidateList}

Respond with a JSON array of objects with keys: index (1-based number from the list), similarity, sharedTopics, contentStyle, cluster, reason, sharedAudience.`
    }
  ];

  try {
    const response = await callOpenRouter(userId, messages, {
      model: 'google/gemini-3-flash-preview',
      temperature: 0.3,
      maxTokens: 8192,
    });

    // Parse the response
    let content = response.content.trim();
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    const parsed = JSON.parse(content) as Array<{
      index: number;
      similarity: number;
      sharedTopics: string[];
      contentStyle: string;
      cluster: number;
      reason: string;
      sharedAudience: string;
    }>;

    return parsed
      .filter((r) => r.index >= 1 && r.index <= candidates.length)
      .map((r) => ({
        channelId: candidates[r.index - 1].channelId,
        similarity: Math.max(0, Math.min(1, r.similarity)),
        sharedTopics: r.sharedTopics || [],
        contentStyle: r.contentStyle || '',
        cluster: r.cluster ?? 0,
        reason: r.reason || '',
        sharedAudience: r.sharedAudience || '',
      }));
  } catch (err) {
    console.error('[NicheDiscovery] AI analysis failed, falling back to basic scoring:', err);
    return candidates.map((ch, i) => ({
      channelId: ch.channelId,
      similarity: 0.1,
      sharedTopics: [],
      contentStyle: 'Unable to analyze',
      cluster: i % 4,
      reason: 'AI analysis unavailable',
      sharedAudience: 'Unknown',
    }));
  }
}

// ---------------------------------------------------------------------------
// Main Processor
// ---------------------------------------------------------------------------

export async function nicheDiscoveryProcessor(job: Job): Promise<void> {
  const supabase = getServiceSupabase();
  const startTime = Date.now();
  const taskId: string | undefined = job.data?.taskId;

  console.log('[NicheDiscovery] Starting multi-signal niche discovery scan...');

  // Get all users with linked channels
  const { data: channels } = await supabase
    .from('youtube_channels')
    .select('id, user_id, channel_id, channel_title')
    .eq('sync_status', 'synced');

  if (!channels || channels.length === 0) {
    console.log('[NicheDiscovery] No synced channels found, skipping.');
    return;
  }

  // Group by user
  const userChannels = new Map<string, typeof channels>();
  for (const ch of channels) {
    const existing = userChannels.get(ch.user_id) || [];
    existing.push(ch);
    userChannels.set(ch.user_id, existing);
  }

  let totalDiscovered = 0;
  let usersProcessed = 0;

  for (const [userId, userChs] of userChannels) {
    try {
      const token = await getValidYouTubeToken(userId);
      // Fetch user's project ID for per-user quota billing
      const { data: gcpConfig } = await supabase
        .from('user_gcp_config')
        .select('project_id')
        .eq('user_id', userId)
        .single();
      const api = new YouTubeApi(token, gcpConfig?.project_id ?? undefined);

      const primaryChannel = userChs[0];

      // Log start
      const { data: syncLog } = await supabase
        .from('analytics_sync_log')
        .insert({
          user_id: userId,
          channel_id: primaryChannel.id,
          sync_type: 'niche_discovery',
          status: 'running',
        })
        .select('id')
        .single();

      try {
        // =====================================================================
        // PHASE 1: Build user's channel profile
        // =====================================================================
        await updateTaskProgress(supabase, taskId, 'channel_profiling', `Profiling "${primaryChannel.channel_title}"`);
        console.log(`[NicheDiscovery] Building profile for "${primaryChannel.channel_title}"...`);
        const userProfile = await buildChannelProfile(api, primaryChannel.channel_id, primaryChannel.channel_title);

        if (userProfile.videoTitles.length < 3) {
          console.log(`[NicheDiscovery] User ${userId}: Not enough videos (${userProfile.videoTitles.length}), skipping.`);
          if (syncLog) {
            await supabase
              .from('analytics_sync_log')
              .update({ status: 'completed', completed_at: new Date().toISOString(), duration_ms: Date.now() - startTime, records_synced: 0 })
              .eq('id', syncLog.id);
          }
          continue;
        }

        // Generate embedding for user's channel
        let userEmbedding: number[] | null = null;
        try {
          const userEmbeddingText = buildEmbeddingText(
            primaryChannel.channel_title,
            userProfile.description,
            userProfile.videoTitles,
            userProfile.videoTags
          );
          userEmbedding = await generateEmbedding(userEmbeddingText);
          console.log('[NicheDiscovery] Generated user channel embedding');
        } catch (err) {
          console.warn('[NicheDiscovery] Failed to generate user embedding, skipping embedding similarity:', err);
        }

        // =====================================================================
        // PHASE 2: Discover candidate channels (multi-method)
        // =====================================================================
        const discovered: DiscoveredChannel[] = [];
        const seenChannelIds = new Set<string>();
        let quotaUsed = 0;

        // Add user's own channels to seen list
        for (const ch of userChs) seenChannelIds.add(ch.channel_id);

        // Also pull keywords from competitors
        const { data: competitors } = await supabase
          .from('competitor_channels')
          .select('channel_id, niche_tags')
          .eq('user_id', userId);

        // Add existing competitors to seen list
        for (const comp of competitors || []) seenChannelIds.add(comp.channel_id as string);

        const competitorKeywords: string[] = [];
        for (const comp of competitors || []) {
          const tags = comp.niche_tags as string[] | null;
          if (tags) competitorKeywords.push(...tags);
        }

        // ----- METHOD 1: Featured Channel Crawling -----
        await updateTaskProgress(supabase, taskId, 'channel_crawling', 'Crawling featured channels');
        console.log('[NicheDiscovery] Crawling featured channels...');
        const featuredChannelIds: string[] = [];

        // Featured channels from user's own channel
        try {
          const userDetails = await api.getChannelById(primaryChannel.channel_id);
          if (userDetails?.featuredChannelsUrls) {
            for (const fcId of userDetails.featuredChannelsUrls) {
              if (!seenChannelIds.has(fcId)) {
                featuredChannelIds.push(fcId);
                seenChannelIds.add(fcId);
              }
            }
          }
          quotaUsed += 1;
        } catch {
          // Continue without user's featured channels
        }

        // Featured channels from competitors
        for (const comp of (competitors || []).slice(0, 5)) {
          try {
            const compDetails = await api.getChannelById(comp.channel_id as string);
            if (compDetails?.featuredChannelsUrls) {
              for (const fcId of compDetails.featuredChannelsUrls) {
                if (!seenChannelIds.has(fcId)) {
                  featuredChannelIds.push(fcId);
                  seenChannelIds.add(fcId);
                }
              }
            }
            quotaUsed += 1;
          } catch {
            // Continue
          }
        }

        // Enrich featured channels
        for (const fcId of featuredChannelIds.slice(0, 20)) {
          try {
            const details = await api.getChannelById(fcId);
            if (details && details.subscriberCount > 0) {
              discovered.push({
                channelId: details.id,
                title: details.title,
                handle: details.handle,
                description: details.description,
                thumbnailUrl: details.thumbnailUrl,
                subscriberCount: details.subscriberCount,
                viewCount: details.viewCount,
                videoCount: details.videoCount,
                recentVideoTitles: [],
                recentVideoTags: [],
                topicCategories: details.topicCategories || [],
                discoveryMethod: 'featured_channel',
              });
            }
            quotaUsed += 1;
          } catch {
            // Skip
          }
        }

        console.log(`[NicheDiscovery] Found ${discovered.length} channels via featured channel crawling`);

        // ----- METHOD 2: Keyword Search (existing, improved) -----
        const allKeywords = [...new Set([...userProfile.keywords, ...competitorKeywords])];

        const searchQueries: string[] = [];
        for (let i = 0; i < Math.min(allKeywords.length, 6); i++) {
          const q = allKeywords.slice(i, i + 3).join(' ');
          searchQueries.push(q);
        }
        if (userProfile.description) {
          const descWords = userProfile.description.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 6);
          if (descWords.length >= 2) {
            searchQueries.push(descWords.slice(0, 3).join(' '));
            searchQueries.push(descWords.slice(3, 6).join(' '));
          }
        }

        await updateTaskProgress(supabase, taskId, 'keyword_search', `Searching ${searchQueries.length} keyword queries`);
        console.log(`[NicheDiscovery] Searching with ${searchQueries.length} keyword queries...`);

        for (const query of searchQueries.slice(0, 8)) {
          try {
            const results = await api.searchChannels(query, 15);
            quotaUsed += 100;

            for (const result of results) {
              if (seenChannelIds.has(result.channelId)) continue;
              seenChannelIds.add(result.channelId);

              discovered.push({
                channelId: result.channelId,
                title: result.title,
                description: result.description,
                thumbnailUrl: result.thumbnailUrl,
                subscriberCount: 0,
                viewCount: 0,
                videoCount: 0,
                recentVideoTitles: [],
                recentVideoTags: [],
                topicCategories: [],
                discoveryMethod: 'keyword_search',
              });
            }
          } catch (err) {
            console.warn(`[NicheDiscovery] Search failed for "${query}":`, err);
          }
        }

        console.log(`[NicheDiscovery] Found ${discovered.length} total raw candidates after keyword search`);

        // =====================================================================
        // PHASE 3: Enrich top candidates with details + recent videos + tags
        // =====================================================================
        await updateTaskProgress(supabase, taskId, 'enrichment', 'Enriching top candidates with details');
        console.log('[NicheDiscovery] Enriching top 50 candidates...');
        const toEnrich = discovered.slice(0, 50);
        for (const ch of toEnrich) {
          // Skip enrichment for already-enriched featured channels
          if (ch.discoveryMethod === 'featured_channel' && ch.subscriberCount > 0) {
            // Just fetch recent videos + tags for featured channels
          } else {
            try {
              const details = await api.getChannelById(ch.channelId);
              if (details) {
                ch.subscriberCount = details.subscriberCount;
                ch.viewCount = details.viewCount;
                ch.videoCount = details.videoCount;
                ch.handle = details.handle;
                ch.description = details.description || ch.description;
                ch.topicCategories = details.topicCategories || [];
                quotaUsed += 1;
              }
            } catch {
              // Skip enrichment failures
            }
          }

          // Fetch recent video titles + tags
          try {
            const uploadsPlaylistId = ch.channelId.startsWith('UC')
              ? 'UU' + ch.channelId.slice(2)
              : ch.channelId;
            const vids = await api.getChannelVideos(uploadsPlaylistId, 10);
            ch.recentVideoTitles = vids.items.map(v => v.title);
            quotaUsed += 1;

            // Fetch tags for up to 10 videos
            const videoIds = vids.items.map(v => v.videoId).slice(0, 10);
            if (videoIds.length > 0) {
              try {
                const videoDetails = await api.getMultipleVideoDetails(videoIds);
                const tags: string[] = [];
                for (const v of videoDetails) {
                  if (v.tags) tags.push(...v.tags);
                }
                ch.recentVideoTags = [...new Set(tags.map(t => t.toLowerCase()))];
                quotaUsed += 1;
              } catch {
                // Skip tag fetching
              }
            }
          } catch {
            // Skip video fetch failures
          }
        }

        // Filter out channels with no subscribers
        const validCandidates = toEnrich.filter((ch) => ch.subscriberCount > 0);
        console.log(`[NicheDiscovery] ${validCandidates.length} valid candidates after enrichment`);

        // =====================================================================
        // PHASE 4: Snowball expansion — discover featured channels of top matches
        // =====================================================================
        await updateTaskProgress(supabase, taskId, 'snowball_expansion', 'Expanding via featured channels of top matches');
        console.log('[NicheDiscovery] Snowball expansion (2nd-hop channels)...');
        const expansionCandidates: DiscoveredChannel[] = [];

        // Use the first 10 enriched candidates for expansion
        for (const topCh of validCandidates.slice(0, 10)) {
          try {
            const details = await api.getChannelById(topCh.channelId);
            if (details?.featuredChannelsUrls) {
              for (const fcId of details.featuredChannelsUrls.slice(0, 5)) {
                if (seenChannelIds.has(fcId)) continue;
                seenChannelIds.add(fcId);

                try {
                  const fcDetails = await api.getChannelById(fcId);
                  if (fcDetails && fcDetails.subscriberCount > 0) {
                    expansionCandidates.push({
                      channelId: fcDetails.id,
                      title: fcDetails.title,
                      handle: fcDetails.handle,
                      description: fcDetails.description,
                      thumbnailUrl: fcDetails.thumbnailUrl,
                      subscriberCount: fcDetails.subscriberCount,
                      viewCount: fcDetails.viewCount,
                      videoCount: fcDetails.videoCount,
                      recentVideoTitles: [],
                      recentVideoTags: [],
                      topicCategories: fcDetails.topicCategories || [],
                      discoveryMethod: 'expansion',
                    });
                    quotaUsed += 1;
                  }
                } catch {
                  // Skip
                }
              }
            }
            quotaUsed += 1;
          } catch {
            // Continue
          }
        }

        // Enrich expansion candidates with video titles/tags
        for (const ch of expansionCandidates.slice(0, 20)) {
          try {
            const uploadsPlaylistId = ch.channelId.startsWith('UC')
              ? 'UU' + ch.channelId.slice(2)
              : ch.channelId;
            const vids = await api.getChannelVideos(uploadsPlaylistId, 5);
            ch.recentVideoTitles = vids.items.map(v => v.title);
            quotaUsed += 1;
          } catch {
            // Skip
          }
        }

        // Merge expansion candidates into valid candidates
        validCandidates.push(...expansionCandidates.filter(c => c.subscriberCount > 0));
        console.log(`[NicheDiscovery] ${expansionCandidates.length} channels found via snowball expansion, ${validCandidates.length} total`);

        // =====================================================================
        // PHASE 5: Compute embedding similarity for each candidate
        // =====================================================================
        const embeddingScores = new Map<string, number>();

        if (userEmbedding) {
          await updateTaskProgress(supabase, taskId, 'embedding_similarity', 'Computing content embeddings');
          console.log('[NicheDiscovery] Computing embedding similarity...');
          for (const ch of validCandidates) {
            try {
              const candidateText = buildEmbeddingText(
                ch.title,
                ch.description || '',
                ch.recentVideoTitles,
                ch.recentVideoTags
              );
              const candidateEmbedding = await generateEmbedding(candidateText);
              const score = cosineSimilarity(userEmbedding, candidateEmbedding);
              embeddingScores.set(ch.channelId, score);
            } catch {
              // Skip embedding failures — will use 0
            }
          }
          console.log(`[NicheDiscovery] Computed embeddings for ${embeddingScores.size}/${validCandidates.length} candidates`);
        }

        // =====================================================================
        // PHASE 6: Compute tag overlap (Jaccard similarity)
        // =====================================================================
        const tagScores = new Map<string, number>();
        for (const ch of validCandidates) {
          const overlap = jaccardSimilarity(userProfile.videoTags, ch.recentVideoTags);
          if (overlap > 0) {
            tagScores.set(ch.channelId, overlap);
          }
        }
        console.log(`[NicheDiscovery] ${tagScores.size} candidates have tag overlap`);

        // =====================================================================
        // PHASE 7: AI-powered similarity analysis (smaller batches of 8)
        // =====================================================================
        await updateTaskProgress(supabase, taskId, 'ai_analysis', 'AI analyzing channel similarity');
        console.log('[NicheDiscovery] Analyzing similarity with Gemini 3 Flash...');

        const allAIResults: AISimilarityResult[] = [];
        const batchSize = 8; // Smaller batches for better quality
        for (let i = 0; i < validCandidates.length; i += batchSize) {
          const batch = validCandidates.slice(i, i + batchSize);
          const batchResults = await analyzeWithAI(
            userId,
            { title: primaryChannel.channel_title, ...userProfile },
            batch
          );
          allAIResults.push(...batchResults);
        }

        // =====================================================================
        // PHASE 8: Multi-signal scoring
        // =====================================================================
        await updateTaskProgress(supabase, taskId, 'scoring', 'Computing multi-signal scores');
        console.log('[NicheDiscovery] Computing multi-signal scores...');

        const multiSignalScores: MultiSignalScore[] = [];

        for (const ch of validCandidates) {
          const aiResult = allAIResults.find(r => r.channelId === ch.channelId);
          const embeddingScore = embeddingScores.get(ch.channelId) ?? 0;
          const tagScore = tagScores.get(ch.channelId) ?? 0;
          const aiScore = aiResult?.similarity ?? 0.1;

          // Discovery method bonus
          let discoveryMethodBonus = 0;
          if (ch.discoveryMethod === 'featured_channel') discoveryMethodBonus = 0.3;
          else if (ch.discoveryMethod === 'expansion') discoveryMethodBonus = 0.15;

          // Topic category match
          let topicCategoryMatch = 0;
          if (userProfile.topicCategories.length > 0 && ch.topicCategories.length > 0) {
            const userTopics = new Set(userProfile.topicCategories);
            const matchCount = ch.topicCategories.filter(t => userTopics.has(t)).length;
            topicCategoryMatch = userProfile.topicCategories.length > 0
              ? matchCount / userProfile.topicCategories.length
              : 0;
          }

          // Weighted composite score
          const finalScore = (
            0.35 * embeddingScore +
            0.30 * aiScore +
            0.20 * tagScore +
            0.10 * discoveryMethodBonus +
            0.05 * topicCategoryMatch
          );

          multiSignalScores.push({
            channelId: ch.channelId,
            finalScore: Math.max(0, Math.min(1, finalScore)),
            embeddingSimilarity: embeddingScore,
            aiSimilarity: aiScore,
            tagOverlap: tagScore,
            discoveryMethodBonus,
            topicCategoryMatch,
            aiReason: aiResult?.reason || '',
            aiSharedAudience: aiResult?.sharedAudience || '',
            aiSharedTopics: aiResult?.sharedTopics || [],
            aiCluster: aiResult?.cluster ?? 0,
          });
        }

        // Sort by final score and keep top 50
        multiSignalScores.sort((a, b) => b.finalScore - a.finalScore);
        const enriched = multiSignalScores.filter(r => r.finalScore >= 0.08).slice(0, 50);

        console.log(`[NicheDiscovery] ${enriched.length} channels passed multi-signal threshold`);

        // =====================================================================
        await updateTaskProgress(supabase, taskId, 'storing_results', `Storing ${enriched.length} channels`);
        // PHASE 9: Store results
        // =====================================================================

        // Insert user's OWN channel as the anchor/center node
        await supabase
          .from('niche_network_channels')
          .upsert({
            user_id: userId,
            channel_id: primaryChannel.channel_id,
            channel_title: primaryChannel.channel_title,
            channel_handle: null,
            thumbnail_url: null,
            subscriber_count: 0,
            view_count: 0,
            video_count: 0,
            discovery_method: 'keyword_search',
            discovery_keywords: userProfile.keywords,
            similarity_score: 1.0,
            shared_topics: userProfile.keywords.slice(0, 10),
            topic_categories: ['My Channel'],
            is_emerging: false,
            graph_x: 0,
            graph_y: 0,
            graph_cluster: -1,
            embedding_similarity: 1.0,
            tag_overlap_score: 1.0,
            similarity_reason: 'This is your own channel.',
            shared_audience: '',
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'user_id,channel_id' });

        // Enrich user's own channel details
        try {
          const ownDetails = await api.getChannelById(primaryChannel.channel_id);
          if (ownDetails) {
            await supabase
              .from('niche_network_channels')
              .update({
                subscriber_count: ownDetails.subscriberCount,
                view_count: ownDetails.viewCount,
                video_count: ownDetails.videoCount,
                channel_handle: ownDetails.handle || null,
                thumbnail_url: ownDetails.thumbnailUrl || null,
              })
              .eq('user_id', userId)
              .eq('channel_id', primaryChannel.channel_id);
          }
        } catch {
          // Continue without own channel enrichment
        }

        // Store discovered channels
        for (const result of enriched) {
          const candidate = validCandidates.find((c) => c.channelId === result.channelId);
          if (!candidate) continue;

          await supabase
            .from('niche_network_channels')
            .upsert({
              user_id: userId,
              channel_id: candidate.channelId,
              channel_title: candidate.title,
              channel_handle: candidate.handle || null,
              thumbnail_url: candidate.thumbnailUrl || null,
              subscriber_count: candidate.subscriberCount,
              view_count: candidate.viewCount,
              video_count: candidate.videoCount,
              discovery_method: candidate.discoveryMethod,
              discovery_keywords: userProfile.keywords.slice(0, 10),
              similarity_score: result.finalScore,
              shared_topics: result.aiSharedTopics,
              topic_categories: [result.aiReason.slice(0, 100)],
              is_emerging: candidate.subscriberCount < 100000 && result.finalScore > 0.2,
              graph_x: 0,
              graph_y: 0,
              graph_cluster: result.aiCluster,
              embedding_similarity: result.embeddingSimilarity,
              tag_overlap_score: result.tagOverlap,
              similarity_reason: result.aiReason,
              shared_audience: result.aiSharedAudience,
              last_synced_at: new Date().toISOString(),
            }, { onConflict: 'user_id,channel_id' });
        }

        // Create edges
        await supabase
          .from('niche_network_edges')
          .delete()
          .eq('user_id', userId);

        // Edge from user's channel to each discovered channel
        for (const result of enriched) {
          await supabase
            .from('niche_network_edges')
            .insert({
              user_id: userId,
              source_channel: primaryChannel.channel_id,
              target_channel: result.channelId,
              weight: result.finalScore,
              shared_keywords: result.aiSharedTopics,
            });
        }

        // Edges between discovered channels in the same cluster
        for (let a = 0; a < enriched.length; a++) {
          for (let b = a + 1; b < enriched.length; b++) {
            if (enriched[a].aiCluster === enriched[b].aiCluster) {
              const sharedTopics = enriched[a].aiSharedTopics.filter(
                (t) => enriched[b].aiSharedTopics.includes(t)
              );
              if (sharedTopics.length >= 1) {
                const weight = Math.min(
                  (enriched[a].finalScore + enriched[b].finalScore) / 2 * 0.6,
                  0.8
                );
                await supabase
                  .from('niche_network_edges')
                  .insert({
                    user_id: userId,
                    source_channel: enriched[a].channelId,
                    target_channel: enriched[b].channelId,
                    weight,
                    shared_keywords: sharedTopics,
                  });
              }
            }
          }
        }

        totalDiscovered += enriched.length;

        // Update sync log
        if (syncLog) {
          await supabase
            .from('analytics_sync_log')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - startTime,
              records_synced: enriched.length,
              quota_used: quotaUsed,
            })
            .eq('id', syncLog.id);
        }

        console.log(`[NicheDiscovery] User ${userId}: Discovered ${enriched.length} channels with multi-signal analysis (quota: ${quotaUsed})`);
        await completeTask(supabase, taskId, 'completed');
      } catch (err) {
        console.error(`[NicheDiscovery] Failed for user ${userId}:`, err);
        if (syncLog) {
          await supabase
            .from('analytics_sync_log')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - startTime,
              error_message: err instanceof Error ? err.message : 'Unknown error',
            })
            .eq('id', syncLog.id);
        }
        await completeTask(supabase, taskId, 'failed', err instanceof Error ? err.message : 'Unknown error');
      }

      usersProcessed++;
      job.updateProgress(Math.round((usersProcessed / userChannels.size) * 100));
    } catch (err) {
      console.error(`[NicheDiscovery] Token error for user ${userId}:`, err);
    }
  }

  console.log(`[NicheDiscovery] Complete. ${usersProcessed} users, ${totalDiscovered} channels discovered.`);
}
