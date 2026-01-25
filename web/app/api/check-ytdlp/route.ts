/**
 * yt-dlp Check API
 * ==========================================================================
 * Checks if yt-dlp and ffmpeg are available on the system.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

async function checkCommand(command: string, args: string[]): Promise<{ available: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ available: true, version: stdout.trim().split('\n')[0] });
      } else {
        resolve({ available: false, error: stderr || 'Command failed' });
      }
    });

    proc.on('error', (err) => {
      resolve({ available: false, error: err.message });
    });
  });
}

export async function GET() {
  const [ytdlp, ffmpeg] = await Promise.all([
    checkCommand('yt-dlp', ['--version']),
    checkCommand('ffmpeg', ['-version']),
  ]);

  return NextResponse.json({
    ytdlp: {
      available: ytdlp.available,
      version: ytdlp.version,
      error: ytdlp.error,
    },
    ffmpeg: {
      available: ffmpeg.available,
      version: ffmpeg.version?.split(' ')[2], // Extract just version number
      error: ffmpeg.error,
    },
    allReady: ytdlp.available && ffmpeg.available,
  });
}
