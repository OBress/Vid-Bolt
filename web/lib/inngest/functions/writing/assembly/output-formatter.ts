/**
 * Output Formatter
 * ============================================================================
 * Formats the final script output with all accompanying materials.
 */

import type { 
  UniversalScriptOutput,
  ExpandedBeat,
  Spine,
  AssetRegistry,
  ResearchDossier,
  DurationDecision,
  QualityValidation,
  BeatType,
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface FormattingOptions {
  script: string;
  expandedBeats: ExpandedBeat[];
  spine: Spine;
  assetRegistry: AssetRegistry;
  dossier: ResearchDossier | null;
  durationDecision: DurationDecision;
  qualityValidation: QualityValidation;
}

// ============================================================================
// MAIN FORMATTER
// ============================================================================

/**
 * Format the complete output structure
 */
export function formatFinalOutput(options: FormattingOptions): UniversalScriptOutput {
  const {
    script,
    expandedBeats,
    spine,
    assetRegistry,
    dossier,
    durationDecision,
    qualityValidation,
  } = options;

  // Build beat timing sheet
  const beatTimingSheet = buildBeatTimingSheet(spine);

  // Build visual callout list
  const visualCalloutList = buildVisualCalloutList(expandedBeats);

  return {
    researchDossier: dossier || undefined,
    durationDecision,
    spine,
    assetRegistry,
    expandedBeats,
    finalScript: script,
    qualityValidation,
    beatTimingSheet,
    visualCalloutList,
    worksCited: dossier?.worksCited,
  };
}

// ============================================================================
// TIMING SHEET
// ============================================================================

/**
 * Build the beat timing sheet for editor reference
 */
function buildBeatTimingSheet(
  spine: Spine
): UniversalScriptOutput['beatTimingSheet'] {
  return spine.beats.map(beat => ({
    beatIndex: beat.index,
    startSeconds: beat.timing.startSeconds,
    endSeconds: beat.timing.endSeconds,
    type: beat.classification.type,
    summary: beat.contentSummary.substring(0, 100),
  }));
}

// ============================================================================
// VISUAL CALLOUT LIST
// ============================================================================

/**
 * Build the visual callout list for image generation
 */
function buildVisualCalloutList(
  beats: ExpandedBeat[]
): UniversalScriptOutput['visualCalloutList'] {
  const callouts: UniversalScriptOutput['visualCalloutList'] = [];

  for (const beat of beats) {
    for (const callout of beat.visualCallouts) {
      callouts.push({
        beatIndex: beat.beatIndex,
        assetId: callout.assetId,
        assetType: getAssetType(callout.assetId),
        context: callout.context,
      });
    }
  }

  return callouts;
}

/**
 * Determine asset type from ID prefix
 */
function getAssetType(assetId: string): 'character' | 'location' | 'object' {
  if (assetId.startsWith('CHAR-')) return 'character';
  if (assetId.startsWith('LOC-')) return 'location';
  return 'object';
}

// ============================================================================
// EXPORT FORMATS
// ============================================================================

/**
 * Format script for TTS (text-to-speech)
 */
export function formatForTTS(script: string): string {
  return script
    // Remove visual callout tags
    .replace(/\[(CHAR|LOC|OBJ)-\d{3}\]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Add pauses after periods
    .replace(/\.\s/g, '. ')
    .trim();
}

/**
 * Format script as SRT subtitles (basic)
 */
export function formatAsSRT(
  beats: ExpandedBeat[],
  spine: Spine
): string {
  const lines: string[] = [];
  let index = 1;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const timing = spine.beats[i]?.timing;
    
    if (!timing) continue;

    const startTime = formatSRTTime(timing.startSeconds);
    const endTime = formatSRTTime(timing.endSeconds);
    
    // Split narration into chunks of ~10 words for subtitles
    const words = beat.narration.replace(/\[(CHAR|LOC|OBJ)-\d{3}\]/g, '').split(/\s+/);
    const chunks: string[] = [];
    
    for (let j = 0; j < words.length; j += 10) {
      chunks.push(words.slice(j, j + 10).join(' '));
    }

    const chunkDuration = timing.durationSeconds / chunks.length;

    for (let c = 0; c < chunks.length; c++) {
      const chunkStart = timing.startSeconds + (c * chunkDuration);
      const chunkEnd = timing.startSeconds + ((c + 1) * chunkDuration);
      
      lines.push(String(index));
      lines.push(`${formatSRTTime(chunkStart)} --> ${formatSRTTime(chunkEnd)}`);
      lines.push(chunks[c]);
      lines.push('');
      
      index++;
    }
  }

  return lines.join('\n');
}

/**
 * Format seconds as SRT timestamp
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${pad(hours)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

function pad(n: number, digits: number = 2): string {
  return String(n).padStart(digits, '0');
}

/**
 * Generate shot list for video editor
 */
export function generateShotList(
  visualCallouts: UniversalScriptOutput['visualCalloutList'],
  assetRegistry: AssetRegistry,
  spine: Spine
): string {
  const lines: string[] = ['# Video Shot List', ''];

  for (const callout of visualCallouts) {
    const beat = spine.beats[callout.beatIndex];
    const timing = beat?.timing;
    
    let assetDescription = callout.assetId;
    
    if (callout.assetType === 'character') {
      const char = assetRegistry.characters.find(c => c.id === callout.assetId);
      assetDescription = char ? `${char.name} (${char.role})` : callout.assetId;
    } else if (callout.assetType === 'location') {
      const loc = assetRegistry.locations.find(l => l.id === callout.assetId);
      assetDescription = loc ? `${loc.name}: ${loc.essence}` : callout.assetId;
    }

    lines.push(`## ${formatDuration(timing?.startSeconds || 0)} - Beat ${callout.beatIndex + 1}`);
    lines.push(`- **Asset**: ${assetDescription}`);
    lines.push(`- **Context**: ${callout.context}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format duration as MM:SS
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Generate summary statistics
 */
export function generateStats(output: UniversalScriptOutput): {
  wordCount: number;
  beatCount: number;
  durationSeconds: number;
  factCount: number;
  quoteCount: number;
  characterCount: number;
  locationCount: number;
  visualCalloutCount: number;
} {
  return {
    wordCount: output.expandedBeats.reduce((sum, b) => sum + b.wordCount, 0),
    beatCount: output.spine.beatCount,
    durationSeconds: output.spine.totalDurationSeconds,
    factCount: output.researchDossier?.facts.length || 0,
    quoteCount: output.researchDossier?.quotes.length || 0,
    characterCount: output.assetRegistry.characters.length,
    locationCount: output.assetRegistry.locations.length,
    visualCalloutCount: output.visualCalloutList.length,
  };
}
