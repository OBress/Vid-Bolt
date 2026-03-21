/**
 * Audio Normalizer Service
 * ============================================================================
 * LUFS-based audio normalization using FFmpeg's `loudnorm` filter.
 * Implements EBU R128 / ITU-R BS.1770-4 compliant two-pass normalization.
 *
 * Two-pass loudnorm ensures linear (gain-only) normalization that preserves
 * the original dynamics of the audio, unlike single-pass which applies
 * dynamic range compression.
 *
 * Default target: -16 LUFS / -1 dBTP / 11 LU LRA
 *
 * Usage:
 *   const result = await normalizeAudio(buffer, { inputFormat: 'mp3' });
 *   if (result.normalized) {
 *     // result.buffer contains normalized audio
 *   }
 *
 * Dependencies:
 *   - FFmpeg must be available on the system PATH
 *   - Already installed in production Docker image (Dockerfile.prod)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join, parse } from 'path';
import {
  uploadAudioBuffer,
  getS3Client,
  getBucketName,
  getPublicBaseUrl,
  getPublicUrl,
} from './r2-storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const execFileAsync = promisify(execFile);

// ============================================================================
// Constants
// ============================================================================

/** Default normalization target: -16 LUFS (standard for web video) */
const DEFAULT_TARGET_LUFS = -16;

/** Default true peak limit: -1 dBTP (prevents inter-sample clipping) */
const DEFAULT_TRUE_PEAK = -1;

/** Default loudness range: 11 LU (EBU R128 default, preserves dynamics) */
const DEFAULT_LRA = 11;

/** Default output sample rate: 48kHz (matches TTS source rate) */
const DEFAULT_SAMPLE_RATE = 48000;

/**
 * Skip normalization if the source is already within this tolerance of the
 * target LUFS. Avoids pointless re-encoding of already-normalized audio.
 */
const LUFS_TOLERANCE = 0.5;

/** Maximum file size we'll attempt to normalize (100 MB) */
const MAX_INPUT_SIZE_BYTES = 100 * 1024 * 1024;

// ============================================================================
// Types
// ============================================================================

/** Loudness analysis report from FFmpeg loudnorm pass 1 */
export interface LoudnessReport {
  /** Integrated loudness in LUFS */
  inputI: number;
  /** True peak in dBTP */
  inputTp: number;
  /** Loudness range in LU */
  inputLra: number;
  /** Loudness threshold in LUFS */
  inputThresh: number;
  /** Target offset applied */
  targetOffset: number;
}

/** Options for normalization */
export interface NormalizationOptions {
  /** Target integrated loudness in LUFS (default: -16) */
  targetLufs?: number;
  /** True peak limit in dBTP (default: -1) */
  truePeak?: number;
  /** Loudness range in LU (default: 11) */
  lra?: number;
  /** Input format hint (e.g. 'mp3', 'wav') — helps FFmpeg decode correctly */
  inputFormat?: string;
  /** Output format override. Defaults to matching input format */
  outputFormat?: string;
  /** Output sample rate in Hz (default: 48000) */
  sampleRate?: number;
}

/** Result from a normalization operation */
export interface NormalizationResult {
  /** The (possibly normalized) audio buffer */
  buffer: Buffer;
  /** Whether normalization was actually applied */
  normalized: boolean;
  /** Original integrated loudness in LUFS */
  originalLufs: number;
  /** Post-normalization integrated loudness in LUFS */
  normalizedLufs: number;
  /** Original true peak in dBTP */
  originalTruePeak: number;
  /** Gain applied in dB (0 if skipped) */
  gainApplied: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Reason normalization was skipped, if applicable */
  skipReason?: string;
}

export interface StoredNormalizationResult extends NormalizationResult {
  key: string;
  url: string;
  contentType: string;
}

export interface VideoAudioExtractionResult {
  hasEmbeddedAudio: boolean;
  normalized: boolean;
  processingTimeMs: number;
  normalizedAudioKey?: string;
  normalizedAudioUrl?: string;
  originalLufs?: number | null;
  normalizedLufs?: number | null;
  truePeakDbtp?: number | null;
  skipReason?: string;
}

// ============================================================================
// FFmpeg Availability Check
// ============================================================================

let _ffmpegAvailable: boolean | null = null;
let _ffmpegVersion: string | null = null;

/**
 * Check whether FFmpeg is available on the system PATH.
 * Result is cached after the first call.
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable;

  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version'], {
      timeout: 5000,
    });
    _ffmpegVersion = stdout.split('\n')[0]?.trim() || 'unknown';
    _ffmpegAvailable = true;
    console.log(`[AudioNormalizer] FFmpeg available: ${_ffmpegVersion}`);
  } catch {
    _ffmpegAvailable = false;
    console.warn('[AudioNormalizer] FFmpeg not available — audio normalization will be skipped');
  }

  return _ffmpegAvailable;
}

// ============================================================================
// Core: Loudness Analysis (Pass 1)
// ============================================================================

/**
 * Analyze the loudness characteristics of an audio buffer without modifying it.
 * Uses FFmpeg's loudnorm filter in measurement mode.
 *
 * @param input - Audio buffer to analyze
 * @param inputFormat - Format hint (e.g. 'mp3', 'wav')
 * @returns Loudness report with LUFS, true peak, LRA, and threshold
 */
export async function analyzeLoudness(
  input: Buffer,
  inputFormat?: string,
): Promise<LoudnessReport> {
  if (!(await isFFmpegAvailable())) {
    throw new Error('FFmpeg is not available — cannot analyze loudness');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'audio-norm-'));
  const ext = inputFormat || 'mp3';
  const inputPath = join(tempDir, `input.${ext}`);

  try {
    await writeFile(inputPath, input);

    // Pass 1: Measurement-only run with loudnorm filter
    // The filter outputs JSON stats to stderr when print_format=json
    const { stderr } = await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-i', inputPath,
      '-af', `loudnorm=I=${DEFAULT_TARGET_LUFS}:TP=${DEFAULT_TRUE_PEAK}:LRA=${DEFAULT_LRA}:print_format=json`,
      '-f', 'null',
      '-',
    ], {
      timeout: 60000, // 60s timeout for analysis
      maxBuffer: 10 * 1024 * 1024, // 10 MB stderr buffer
    });

    return parseLoudnormOutput(stderr);
  } finally {
    await cleanupTempFiles(tempDir, [inputPath]);
  }
}

// ============================================================================
// Core: Two-Pass Normalization
// ============================================================================

/**
 * Normalize an audio buffer to the target LUFS using two-pass loudnorm.
 *
 * Pass 1: Measures the audio's loudness characteristics.
 * Pass 2: Applies linear gain correction using measured values.
 *
 * If the audio is already within tolerance of the target, returns the
 * original buffer unchanged to avoid unnecessary re-encoding.
 *
 * @param input - Audio buffer to normalize
 * @param options - Normalization parameters
 * @returns Normalization result with buffer and metadata
 */
export async function normalizeAudio(
  input: Buffer,
  options: NormalizationOptions = {},
): Promise<NormalizationResult> {
  const startTime = Date.now();
  const targetLufs = options.targetLufs ?? DEFAULT_TARGET_LUFS;
  const truePeak = options.truePeak ?? DEFAULT_TRUE_PEAK;
  const lra = options.lra ?? DEFAULT_LRA;
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const inputFormat = options.inputFormat || 'mp3';
  const outputFormat = options.outputFormat || inputFormat;

  // ── Guard: FFmpeg availability ──────────────────────────────────
  if (!(await isFFmpegAvailable())) {
    return {
      buffer: input,
      normalized: false,
      originalLufs: 0,
      normalizedLufs: 0,
      originalTruePeak: 0,
      gainApplied: 0,
      processingTimeMs: Date.now() - startTime,
      skipReason: 'FFmpeg not available',
    };
  }

  // ── Guard: File size ────────────────────────────────────────────
  if (input.length > MAX_INPUT_SIZE_BYTES) {
    console.warn(`[AudioNormalizer] Input too large (${(input.length / 1024 / 1024).toFixed(1)} MB) — skipping`);
    return {
      buffer: input,
      normalized: false,
      originalLufs: 0,
      normalizedLufs: 0,
      originalTruePeak: 0,
      gainApplied: 0,
      processingTimeMs: Date.now() - startTime,
      skipReason: `Input exceeds ${MAX_INPUT_SIZE_BYTES / 1024 / 1024} MB limit`,
    };
  }

  // ── Guard: Empty buffer ─────────────────────────────────────────
  if (input.length === 0) {
    return {
      buffer: input,
      normalized: false,
      originalLufs: 0,
      normalizedLufs: 0,
      originalTruePeak: 0,
      gainApplied: 0,
      processingTimeMs: Date.now() - startTime,
      skipReason: 'Empty input buffer',
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'audio-norm-'));
  const inputPath = join(tempDir, `input.${inputFormat}`);
  const outputPath = join(tempDir, `output.${outputFormat}`);

  try {
    await writeFile(inputPath, input);

    // ── Pass 1: Measure loudness ──────────────────────────────────
    const { stderr: measureStderr } = await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-i', inputPath,
      '-af', `loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=${lra}:print_format=json`,
      '-f', 'null',
      '-',
    ], {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const report = parseLoudnormOutput(measureStderr);

    // ── Check: Already at target? ─────────────────────────────────
    if (Math.abs(report.inputI - targetLufs) <= LUFS_TOLERANCE) {
      console.log(
        `[AudioNormalizer] Already at target (${report.inputI.toFixed(1)} LUFS, ` +
        `within ±${LUFS_TOLERANCE} of ${targetLufs}) — skipping`
      );
      return {
        buffer: input,
        normalized: false,
        originalLufs: report.inputI,
        normalizedLufs: report.inputI,
        originalTruePeak: report.inputTp,
        gainApplied: 0,
        processingTimeMs: Date.now() - startTime,
        skipReason: 'Already within tolerance',
      };
    }

    // ── Pass 2: Apply normalization with measured values ───────────
    const outputCodecArgs = getOutputCodecArgs(outputFormat);

    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-y', // Overwrite output
      '-i', inputPath,
      '-af', [
        `loudnorm=I=${targetLufs}`,
        `TP=${truePeak}`,
        `LRA=${lra}`,
        `measured_I=${report.inputI}`,
        `measured_TP=${report.inputTp}`,
        `measured_LRA=${report.inputLra}`,
        `measured_thresh=${report.inputThresh}`,
        `offset=${report.targetOffset}`,
        'linear=true',
        'print_format=json',
      ].join(':'),
      '-ar', String(sampleRate),
      ...outputCodecArgs,
      outputPath,
    ], {
      timeout: 120000, // 2 min timeout for normalization
      maxBuffer: 10 * 1024 * 1024,
    });

    const normalizedBuffer = await readFile(outputPath);
    const gainApplied = targetLufs - report.inputI;

    return {
      buffer: normalizedBuffer,
      normalized: true,
      originalLufs: report.inputI,
      normalizedLufs: targetLufs,
      originalTruePeak: report.inputTp,
      gainApplied,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AudioNormalizer] Normalization failed: ${errMsg}`);

    // Return original buffer on failure — never break the pipeline
    return {
      buffer: input,
      normalized: false,
      originalLufs: 0,
      normalizedLufs: 0,
      originalTruePeak: 0,
      gainApplied: 0,
      processingTimeMs: Date.now() - startTime,
      skipReason: `Error: ${errMsg}`,
    };
  } finally {
    await cleanupTempFiles(tempDir, [inputPath, outputPath]);
  }
}

// ============================================================================
// R2 Integration: Download → Normalize → Re-Upload
// ============================================================================

/**
 * Download audio from an R2 URL, normalize it, and re-upload to the same key.
 * Used for assets that are uploaded directly to R2 by external services (e.g.
 * GPU API uploads music WAV files via presigned URL).
 *
 * @param r2Url - Public R2 URL of the audio file
 * @param r2Key - R2 storage key (extracted from URL if not provided)
 * @param options - Normalization options
 * @returns Normalization result (buffer is the normalized audio)
 */
export async function normalizeAudioFromR2(
  r2Url: string,
  r2Key?: string,
  options: NormalizationOptions = {},
): Promise<NormalizationResult> {
  const startTime = Date.now();
  const key = r2Key || extractKeyFromR2Url(r2Url);

  // ── Guard: FFmpeg availability ──────────────────────────────────
  if (!(await isFFmpegAvailable())) {
    return {
      buffer: Buffer.alloc(0),
      normalized: false,
      originalLufs: 0,
      normalizedLufs: 0,
      originalTruePeak: 0,
      gainApplied: 0,
      processingTimeMs: Date.now() - startTime,
      skipReason: 'FFmpeg not available',
    };
  }

  try {
    // Download from R2 via S3 API (bypasses CDN caching issues)
    const audioBuffer = await downloadFromR2(key);

    // Detect format from key extension
    const ext = key.split('.').pop()?.toLowerCase() || 'mp3';
    const inputFormat = options.inputFormat || ext;

    // Normalize
    const result = await normalizeAudio(audioBuffer, {
      ...options,
      inputFormat,
    });

    // Re-upload if normalization was applied
    if (result.normalized) {
      const contentType = getContentType(inputFormat);
      await uploadAudioBuffer(result.buffer, key, contentType);
    }

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AudioNormalizer] R2 normalization failed for ${key}: ${errMsg}`);

    return {
      buffer: Buffer.alloc(0),
      normalized: false,
      originalLufs: 0,
      normalizedLufs: 0,
      originalTruePeak: 0,
      gainApplied: 0,
      processingTimeMs: Date.now() - startTime,
      skipReason: `R2 error: ${errMsg}`,
    };
  }
}

/**
 * Download an audio file from a URL (any HTTP/HTTPS URL) and return it as a Buffer.
 * Used for external audio sources (e.g. Freesound SFX previews).
 *
 * @param url - URL to download from
 * @returns Audio data as a Buffer
 */
export async function downloadAudioFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download audio from ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Download external audio, normalize it, and upload the result to an owned R2
 * key. The uploaded file is always written, even when normalization is skipped,
 * so callers always receive an owned URL for timeline use.
 */
export async function normalizeExternalAudioToR2(
  sourceUrl: string,
  outputR2Key: string,
  options: NormalizationOptions = {},
): Promise<StoredNormalizationResult> {
  const sourceBuffer = await downloadAudioFromUrl(sourceUrl);
  const inputFormat = options.inputFormat || inferFormatFromPath(sourceUrl, 'mp3');
  const outputFormat = options.outputFormat || inputFormat || 'mp3';
  const result = await normalizeAudio(sourceBuffer, {
    ...options,
    inputFormat,
    outputFormat,
  });

  const contentType = getContentType(outputFormat);
  await uploadAudioBuffer(result.buffer, outputR2Key, contentType);

  return {
    ...result,
    key: outputR2Key,
    url: getPublicUrl(outputR2Key),
    contentType,
  };
}

/**
 * Extract the first audio stream from a video stored in R2, normalize it, and
 * upload the normalized result to a dedicated R2 key.
 */
export async function extractAndNormalizeVideoAudioFromR2(
  videoUrl: string,
  outputR2Key: string,
  options: NormalizationOptions = {},
): Promise<VideoAudioExtractionResult> {
  const startTime = Date.now();

  if (!(await isFFmpegAvailable())) {
    return {
      hasEmbeddedAudio: false,
      normalized: false,
      processingTimeMs: Date.now() - startTime,
      skipReason: 'FFmpeg not available',
    };
  }

  const sourceKey = extractKeyFromR2Url(videoUrl);
  const sourceBuffer = await downloadFromR2(sourceKey);
  const sourceExt = inferFormatFromPath(sourceKey, 'mp4');
  const outputFormat = options.outputFormat || 'mp3';
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;

  const tempDir = await mkdtemp(join(tmpdir(), 'video-audio-extract-'));
  const inputPath = join(tempDir, `input.${sourceExt}`);
  const extractedPath = join(tempDir, `extracted.${outputFormat}`);

  try {
    await writeFile(inputPath, sourceBuffer);

    const hasEmbeddedAudio = await videoHasAudioStream(inputPath);
    if (!hasEmbeddedAudio) {
      return {
        hasEmbeddedAudio: false,
        normalized: false,
        processingTimeMs: Date.now() - startTime,
        skipReason: 'Video has no embedded audio stream',
      };
    }

    const outputCodecArgs = getOutputCodecArgs(outputFormat);
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        '2',
        '-ar',
        String(sampleRate),
        ...outputCodecArgs,
        extractedPath,
      ],
      {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const extractedBuffer = await readFile(extractedPath);
    const normalizedResult = await normalizeAudio(extractedBuffer, {
      ...options,
      inputFormat: outputFormat,
      outputFormat,
      sampleRate,
    });

    await uploadAudioBuffer(
      normalizedResult.buffer,
      outputR2Key,
      getContentType(outputFormat),
    );

    return {
      hasEmbeddedAudio: true,
      normalized: normalizedResult.normalized,
      processingTimeMs: Date.now() - startTime,
      normalizedAudioKey: outputR2Key,
      normalizedAudioUrl: getPublicUrl(outputR2Key),
      originalLufs: normalizedResult.originalLufs,
      normalizedLufs: normalizedResult.normalizedLufs,
      truePeakDbtp: normalizedResult.originalTruePeak,
      skipReason: normalizedResult.skipReason,
    };
  } finally {
    await cleanupTempFiles(tempDir, [inputPath, extractedPath]);
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Parse the JSON loudness stats from FFmpeg's loudnorm filter output.
 * The filter prints JSON to stderr wrapped in plain-text FFmpeg output.
 */
function parseLoudnormOutput(stderr: string): LoudnessReport {
  // Extract JSON block from FFmpeg stderr output.
  // loudnorm outputs a JSON object containing measurements like:
  // {
  //   "input_i" : "-22.34",
  //   "input_tp" : "-3.21",
  //   "input_lra" : "7.50",
  //   "input_thresh" : "-32.67",
  //   "target_offset" : "0.23"
  // }
  const jsonMatch = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);

  if (!jsonMatch) {
    throw new Error(
      '[AudioNormalizer] Failed to parse loudnorm output — no JSON block found in FFmpeg stderr. ' +
      `stderr (last 500 chars): ${stderr.slice(-500)}`
    );
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const inputI = parseFloat(parsed.input_i);
    const inputTp = parseFloat(parsed.input_tp);
    const inputLra = parseFloat(parsed.input_lra);
    const inputThresh = parseFloat(parsed.input_thresh);
    const targetOffset = parseFloat(parsed.target_offset);

    // Validate parsed values — FFmpeg can return -inf for silent audio
    if (!Number.isFinite(inputI)) {
      throw new Error(`Parsed input_i is not finite: ${parsed.input_i} (audio may be silent)`);
    }

    return { inputI, inputTp, inputLra, inputThresh, targetOffset };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `[AudioNormalizer] Invalid JSON in loudnorm output: ${jsonMatch[0].substring(0, 200)}`
      );
    }
    throw error;
  }
}

/**
 * Build FFmpeg output codec arguments based on the desired format.
 * Ensures high-quality encoding while keeping file size reasonable.
 */
function getOutputCodecArgs(format: string): string[] {
  switch (format.toLowerCase()) {
    case 'mp3':
      return ['-codec:a', 'libmp3lame', '-q:a', '2']; // VBR quality 2 (~190 kbps)
    case 'wav':
      return ['-codec:a', 'pcm_s16le']; // 16-bit PCM
    case 'flac':
      return ['-codec:a', 'flac', '-compression_level', '5'];
    case 'aac':
    case 'm4a':
      return ['-codec:a', 'aac', '-b:a', '192k'];
    case 'ogg':
      return ['-codec:a', 'libvorbis', '-q:a', '6'];
    default:
      // Let FFmpeg choose based on output extension
      return [];
  }
}

/**
 * Map file extension to MIME content type.
 */
function getContentType(format: string): string {
  const types: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
  };
  return types[format.toLowerCase()] || 'application/octet-stream';
}

function inferFormatFromPath(pathOrUrl: string, fallback: string): string {
  try {
    const pathname = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
      ? new URL(pathOrUrl).pathname
      : pathOrUrl;
    const ext = parse(pathname).ext.replace(/^\./, '').toLowerCase();
    return ext || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Extract the R2 storage key from a public R2 URL.
 * strips the R2_PUBLIC_URL base to get the key path.
 */
function extractKeyFromR2Url(url: string): string {
  try {
    const baseUrl = getPublicBaseUrl();
    if (url.startsWith(baseUrl)) {
      return url.slice(baseUrl.length + 1); // +1 for the trailing slash
    }
  } catch {
    // getPublicBaseUrl may throw if env var is missing — fall back to URL parsing
  }

  // Fallback: extract path from URL, removing leading slash
  const urlObj = new URL(url);
  return urlObj.pathname.replace(/^\//, '');
}

/**
 * Download a file from R2 storage via the S3 API.
 * Uses direct S3 access to bypass CDN caching/propagation delays.
 */
async function downloadFromR2(key: string): Promise<Buffer> {
  const client = getS3Client();
  const bucketName = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await client.send(command);

  if (!response.Body) {
    throw new Error(`[AudioNormalizer] No body returned from R2 for key: ${key}`);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function videoHasAudioStream(inputPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'json',
        inputPath,
      ],
      {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      },
    );

    const parsed = JSON.parse(stdout) as { streams?: Array<{ codec_name?: string }> };
    return Array.isArray(parsed.streams) && parsed.streams.length > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[AudioNormalizer] ffprobe audio-stream detection failed: ${message}`);
    return false;
  }
}

/**
 * Clean up temporary files and directory created during normalization.
 * Failures are logged but never thrown — cleanup is best-effort.
 */
async function cleanupTempFiles(tempDir: string, files: string[]): Promise<void> {
  for (const file of files) {
    try {
      await unlink(file);
    } catch {
      // File may not exist if normalization was skipped
    }
  }
  try {
    // Remove the temp directory (must be empty)
    const { rmdir } = await import('fs/promises');
    await rmdir(tempDir);
  } catch {
    // Directory may not be empty or already removed
  }
}
