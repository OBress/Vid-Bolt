/**
 * yt-dlp Integration
 * ==========================================================================
 * Downloads YouTube videos using yt-dlp CLI tool.
 * Requires yt-dlp and ffmpeg to be installed in the environment.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ==========================================================================
// Types
// ==========================================================================

export interface DownloadProgress {
  stage: 'downloading' | 'processing' | 'complete';
  progress: number; // 0-100
  message: string;
  speed?: string;
  eta?: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  duration: number; // seconds
  thumbnail: string;
  uploader: string;
  uploadDate: string;
  viewCount: number;
}

export interface DownloadResult {
  videoPath: string;
  videoInfo: VideoInfo;
  fileSize: number;
}

// ==========================================================================
// yt-dlp Functions
// ==========================================================================

/**
 * Check if yt-dlp is installed and available.
 */
export async function isYtdlpInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', ['--version']);
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Get video info without downloading.
 */
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--dump-json',
      '--no-download',
      url,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp info failed: ${stderr}`));
        return;
      }

      try {
        const info = JSON.parse(stdout);
        resolve({
          id: info.id,
          title: info.title,
          description: info.description || '',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || '',
          uploader: info.uploader || '',
          uploadDate: info.upload_date || '',
          viewCount: info.view_count || 0,
        });
      } catch (e) {
        reject(new Error(`Failed to parse yt-dlp output: ${e}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Download a YouTube video to a local file.
 * 
 * @param url - YouTube URL
 * @param outputDir - Directory to save the video
 * @param onProgress - Optional progress callback
 * @returns Path to the downloaded file
 */
export async function downloadVideo(
  url: string,
  outputDir?: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  const tempDir = outputDir || os.tmpdir();
  const outputTemplate = path.join(tempDir, '%(id)s.%(ext)s');

  // First get video info
  const videoInfo = await getVideoInfo(url);
  const expectedPath = path.join(tempDir, `${videoInfo.id}.mp4`);

  console.log(`[yt-dlp] Downloading: ${videoInfo.title}`);
  onProgress?.({ stage: 'downloading', progress: 0, message: 'Starting download...' });

  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      '--merge-output-format', 'mp4',
      '--newline', // Enable progress parsing
      '-o', outputTemplate,
      url,
    ];

    const proc = spawn('yt-dlp', args);
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      
      // Parse progress from yt-dlp output
      const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (progressMatch) {
        const percent = parseFloat(progressMatch[1]);
        
        // Extract speed and ETA if available
        const speedMatch = line.match(/at\s+(\S+)/);
        const etaMatch = line.match(/ETA\s+(\S+)/);
        
        onProgress?.({
          stage: 'downloading',
          progress: Math.floor(percent),
          message: `Downloading... ${percent.toFixed(1)}%`,
          speed: speedMatch?.[1],
          eta: etaMatch?.[1],
        });
      }

      // Check for merging stage
      if (line.includes('[Merger]') || line.includes('[ffmpeg]')) {
        onProgress?.({
          stage: 'processing',
          progress: 95,
          message: 'Merging audio and video...',
        });
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp download failed: ${stderr}`));
        return;
      }

      // Check if file exists
      if (!fs.existsSync(expectedPath)) {
        reject(new Error(`Downloaded file not found at ${expectedPath}`));
        return;
      }

      const stats = fs.statSync(expectedPath);
      console.log(`[yt-dlp] ✓ Downloaded: ${expectedPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'Download complete',
      });

      resolve({
        videoPath: expectedPath,
        videoInfo,
        fileSize: stats.size,
      });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Download video and upload directly to a buffer (for streaming to R2).
 */
export async function downloadVideoToBuffer(
  url: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ buffer: Buffer; videoInfo: VideoInfo }> {
  const result = await downloadVideo(url, undefined, onProgress);
  
  const buffer = fs.readFileSync(result.videoPath);
  
  // Clean up temp file
  fs.unlinkSync(result.videoPath);
  
  return {
    buffer,
    videoInfo: result.videoInfo,
  };
}

/**
 * Extract audio from a video file using ffmpeg.
 */
export async function extractAudio(
  videoPath: string,
  outputPath?: string
): Promise<string> {
  const output = outputPath || videoPath.replace(/\.[^.]+$/, '.mp3');

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', videoPath,
      '-vn', // No video
      '-acodec', 'libmp3lame',
      '-q:a', '2', // High quality
      '-y', // Overwrite
      output,
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg audio extraction failed: ${stderr}`));
        return;
      }
      resolve(output);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Extract a clip from a video using ffmpeg.
 */
export async function extractClip(
  videoPath: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<string> {
  const duration = endTime - startTime;

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-accurate_seek',            // Enable frame-accurate seeking
      '-ss', startTime.toFixed(3), // Precise start time (millisecond precision)
      '-i', videoPath,
      '-t', duration.toFixed(3),   // Precise duration (millisecond precision)
      '-c:v', 'libx264',           // Re-encode video for accurate cuts
      '-c:a', 'aac',               // Re-encode audio for sync
      '-preset', 'fast',           // Balance speed/quality
      '-crf', '23',                // Quality setting (18-28 range, lower = better)
      '-avoid_negative_ts', 'make_zero',  // Fix timestamp issues
      '-async', '1',               // Audio sync correction
      '-y',
      outputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg clip extraction failed: ${stderr}`));
        return;
      }
      console.log(`[ffmpeg] ✓ Extracted clip: ${outputPath}`);
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Extract thumbnail from video at specific time.
 */
export async function extractThumbnail(
  videoPath: string,
  time: number,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-ss', String(time),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      '-update', '1',  // Required for writing single image to non-sequence filename
      '-y',
      outputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg thumbnail extraction failed: ${stderr}`));
        return;
      }
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Extract a video chunk for AI analysis using fast stream copy.
 * This is optimized for speed over precision since we only need
 * approximate chunks for Gemini scene detection.
 * 
 * @param videoPath - Path to source video
 * @param startTime - Start time in seconds
 * @param endTime - End time in seconds
 * @param outputPath - Where to save the chunk
 * @returns Path to the extracted chunk
 */
export async function extractVideoChunk(
  videoPath: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<string> {
  const duration = endTime - startTime;

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-ss', startTime.toFixed(3),     // Seek to start time (before -i for fast seeking)
      '-i', videoPath,
      '-t', duration.toFixed(3),        // Duration to extract
      '-c', 'copy',                     // Stream copy (no re-encoding) - FAST
      '-avoid_negative_ts', 'make_zero', // Fix timestamp issues
      '-y',
      outputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        // Stream copy can fail on some formats - fall back to re-encoding
        console.warn(`[ffmpeg] Stream copy failed, trying re-encode: ${stderr.substring(0, 200)}`);
        extractChunkWithReencode(videoPath, startTime, endTime, outputPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      console.log(`[ffmpeg] ✓ Extracted chunk: ${outputPath} (${duration.toFixed(1)}s)`);
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Fallback chunk extraction with re-encoding for problematic formats.
 */
async function extractChunkWithReencode(
  videoPath: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<string> {
  const duration = endTime - startTime;

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-ss', startTime.toFixed(3),
      '-i', videoPath,
      '-t', duration.toFixed(3),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',           // Fastest encoding (quality doesn't matter for AI)
      '-crf', '28',                      // Lower quality is fine for analysis
      '-c:a', 'aac',
      '-avoid_negative_ts', 'make_zero',
      '-y',
      outputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg chunk re-encode failed: ${stderr}`));
        return;
      }
      console.log(`[ffmpeg] ✓ Extracted chunk (re-encoded): ${outputPath} (${duration.toFixed(1)}s)`);
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}
