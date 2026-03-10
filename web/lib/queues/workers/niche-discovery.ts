/**
 * Niche Discovery Worker
 * 
 * BullMQ processor that discovers channels in the user's niche using AI:
 * 1. Fetch user's channel profile (description + recent videos)
 * 2. Search YouTube for related channels via keywords & topics
 * 3. Use Gemini 3 Flash to analyze semantic similarity
 * 4. Store results in niche_network_channels + niche_network_edges
 */

import { Job } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { getValidYouTubeToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';
import { callOpenRouter, type OpenRouterMessage } from '@/lib/ai/openrouter';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
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
  discoveryMethod: 'keyword_search' | 'expansion' | 'topic_match';
}

interface AISimilarityResult {
  channelId: string;
  similarity: number;
  sharedTopics: string[];
  contentStyle: string;
  cluster: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a text profile of a channel for AI analysis */
async function buildChannelProfile(
  api: YouTubeApi,
  channelYtId: string,
  channelTitle: string,
  maxVideos = 20
): Promise<{ description: string; videoTitles: string[]; keywords: string[] }> {
  let description = '';
  const videoTitles: string[] = [];
  const keywords: string[] = [];

  try {
    // Get channel description
    const details = await api.getChannelById(channelYtId);
    if (details) {
      description = details.description || '';
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
    for (const v of result.items) {
      videoTitles.push(v.title);
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

  return { description, videoTitles, keywords };
}

/** Use Gemini 3 Flash to analyze similarity between user's channel and discovered channels */
async function analyzeWithAI(
  userId: string,
  userProfile: { title: string; description: string; videoTitles: string[] },
  candidates: DiscoveredChannel[]
): Promise<AISimilarityResult[]> {
  if (candidates.length === 0) return [];

  const candidateList = candidates.map((ch, i) => 
    `${i + 1}. "${ch.title}" (${ch.subscriberCount.toLocaleString()} subs)
   Description: ${(ch.description || 'N/A').slice(0, 200)}
   Recent videos: ${ch.recentVideoTitles.slice(0, 5).join('; ') || 'N/A'}`
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
- reason: one sentence explaining the similarity score

Return valid JSON array. Be accurate and useful. Channels making similar content for similar audiences should score 0.5+. Channels in the same broad genre but different sub-niche should score 0.2-0.5. Completely unrelated channels score below 0.1.`
    },
    {
      role: 'user',
      content: `## My Channel: "${userProfile.title}"
Description: ${(userProfile.description || 'N/A').slice(0, 500)}
Recent videos: ${userProfile.videoTitles.slice(0, 10).join('; ')}

## Candidate Channels:
${candidateList}

Respond with a JSON array of objects with keys: channelId (string matching the channel title for matching), index (1-based number from the list), similarity, sharedTopics, contentStyle, cluster, reason.`
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
      }));
  } catch (err) {
    console.error('[NicheDiscovery] AI analysis failed, falling back to basic scoring:', err);
    // Fallback: return basic scores based on keyword overlap
    return candidates.map((ch, i) => ({
      channelId: ch.channelId,
      similarity: 0.1,
      sharedTopics: [],
      contentStyle: 'Unable to analyze',
      cluster: i % 4,
      reason: 'AI analysis unavailable',
    }));
  }
}

// ---------------------------------------------------------------------------
// Main Processor
// ---------------------------------------------------------------------------

export async function nicheDiscoveryProcessor(job: Job): Promise<void> {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  console.log('[NicheDiscovery] Starting AI-powered niche discovery scan...');

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
        // 1. Build user's channel profile
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

        // 2. Also pull keywords from competitors
        const { data: competitors } = await supabase
          .from('competitor_channels')
          .select('channel_id, niche_tags')
          .eq('user_id', userId);

        const competitorKeywords: string[] = [];
        for (const comp of competitors || []) {
          const tags = comp.niche_tags as string[] | null;
          if (tags) competitorKeywords.push(...tags);
        }

        const allKeywords = [...new Set([...userProfile.keywords, ...competitorKeywords])];

        // 3. Search YouTube for channels (broader search: 8 queries, 15 results each)
        const discovered: DiscoveredChannel[] = [];
        const seenChannelIds = new Set<string>();

        // Add user's own channels to seen list
        for (const ch of userChs) seenChannelIds.add(ch.channel_id);
        // Add existing competitors to seen list
        for (const comp of competitors || []) seenChannelIds.add(comp.channel_id as string);

        // Build diverse search queries
        const searchQueries: string[] = [];
        // Keyword pair queries
        for (let i = 0; i < Math.min(allKeywords.length, 6); i++) {
          const q = allKeywords.slice(i, i + 3).join(' ');
          searchQueries.push(q);
        }
        // Topic-based queries from channel description
        if (userProfile.description) {
          const descWords = userProfile.description.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 6);
          if (descWords.length >= 2) {
            searchQueries.push(descWords.slice(0, 3).join(' '));
            searchQueries.push(descWords.slice(3, 6).join(' '));
          }
        }

        let quotaUsed = 0;
        console.log(`[NicheDiscovery] Searching with ${searchQueries.length} queries...`);

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
                discoveryMethod: 'keyword_search',
              });
            }
          } catch (err) {
            console.warn(`[NicheDiscovery] Search failed for "${query}":`, err);
          }
        }

        console.log(`[NicheDiscovery] Found ${discovered.length} raw candidates, enriching top 40...`);

        // 4. Enrich top discoveries with channel details + recent videos
        const toEnrich = discovered.slice(0, 40);
        for (const ch of toEnrich) {
          try {
            const details = await api.getChannelById(ch.channelId);
            if (details) {
              ch.subscriberCount = details.subscriberCount;
              ch.viewCount = details.viewCount;
              ch.videoCount = details.videoCount;
              ch.handle = details.handle;
              ch.description = details.description || ch.description;
              quotaUsed += 1;
            }
          } catch {
            // Skip enrichment failures
          }

          // Fetch a few recent video titles for AI analysis
          try {
            const uploadsPlaylistId = ch.channelId.startsWith('UC')
              ? 'UU' + ch.channelId.slice(2)
              : ch.channelId;
            const vids = await api.getChannelVideos(uploadsPlaylistId, 5);
            ch.recentVideoTitles = vids.items.map(v => v.title);
            quotaUsed += 1;
          } catch {
            // Skip video fetch failures
          }
        }

        // Filter out channels with no subscribers
        const validCandidates = toEnrich.filter((ch) => ch.subscriberCount > 0);
        console.log(`[NicheDiscovery] ${validCandidates.length} valid candidates after enrichment`);

        // 5. AI-powered similarity analysis using Gemini 3 Flash
        console.log(`[NicheDiscovery] Analyzing similarity with Gemini 3 Flash...`);
        
        // Process in batches of 15 to stay within token limits
        const allResults: AISimilarityResult[] = [];
        const batchSize = 15;
        for (let i = 0; i < validCandidates.length; i += batchSize) {
          const batch = validCandidates.slice(i, i + batchSize);
          const batchResults = await analyzeWithAI(
            userId,
            { title: primaryChannel.channel_title, ...userProfile },
            batch
          );
          allResults.push(...batchResults);
        }

        // 6. Filter and sort by AI similarity
        const enriched = allResults
          .filter((r) => r.similarity >= 0.15)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 50);

        console.log(`[NicheDiscovery] ${enriched.length} channels passed AI similarity threshold`);

        // 7. Insert user's OWN channel as the anchor/center node
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
            graph_cluster: -1, // Special cluster for user's channel
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

        // 8. Store discovered channels
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
              similarity_score: result.similarity,
              shared_topics: result.sharedTopics,
              topic_categories: [result.contentStyle],
              is_emerging: candidate.subscriberCount < 100000 && result.similarity > 0.3,
              graph_x: 0, // Let frontend force layout handle positioning
              graph_y: 0,
              graph_cluster: result.cluster,
              last_synced_at: new Date().toISOString(),
            }, { onConflict: 'user_id,channel_id' });
        }

        // 9. Create edges: user ↔ each discovered channel + inter-channel edges
        // Clear old edges for this user first
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
              weight: result.similarity,
              shared_keywords: result.sharedTopics,
            });
        }

        // Edges between discovered channels in the same cluster
        for (let a = 0; a < enriched.length; a++) {
          for (let b = a + 1; b < enriched.length; b++) {
            if (enriched[a].cluster === enriched[b].cluster) {
              const sharedTopics = enriched[a].sharedTopics.filter(
                (t) => enriched[b].sharedTopics.includes(t)
              );
              if (sharedTopics.length >= 1) {
                const weight = Math.min(
                  (enriched[a].similarity + enriched[b].similarity) / 2 * 0.6,
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

        console.log(`[NicheDiscovery] User ${userId}: Discovered ${enriched.length} channels with AI analysis`);
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
      }

      usersProcessed++;
      job.updateProgress(Math.round((usersProcessed / userChannels.size) * 100));
    } catch (err) {
      console.error(`[NicheDiscovery] Token error for user ${userId}:`, err);
    }
  }

  console.log(`[NicheDiscovery] Complete. ${usersProcessed} users, ${totalDiscovered} channels discovered.`);
}
