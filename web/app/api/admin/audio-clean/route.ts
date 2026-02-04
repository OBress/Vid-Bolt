import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFile, unlink, readFile, mkdir, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

/**
 * Audio Cleaning API Route
 * 
 * Uses MMM (Melodic Metadata Massacrer) to remove AI fingerprints,
 * watermarks, and metadata from audio files.
 * 
 * @see https://github.com/geeknik/mmm
 */

const TEMP_DIR = join(tmpdir(), "vidbolt-audio-clean");

// Helper for consistent logging
const log = (stage: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[audio-clean] [${timestamp}] [${stage}] ${message}`, data || "");
};

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await mkdir(TEMP_DIR, { recursive: true });
    log("init", `Temp directory ensured: ${TEMP_DIR}`);
  } catch (e) {
    // Directory may already exist
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let inputPath: string | null = null;
  let outputPath: string | null = null;

  log("start", "=== Audio cleaning request received ===");

  try {
    await ensureTempDir();

    // Parse multipart form data
    log("parse", "Parsing form data...");
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const level = (formData.get("level") as string) || "paranoid";
    const turbo = formData.get("turbo") === "true";
    const verify = formData.get("verify") === "true";

    if (!file) {
      log("error", "No file provided");
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    log("parse", `File received: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
    log("parse", `Options: level=${level}, turbo=${turbo}, verify=${verify}`);

    // Validate file type
    const validExtensions = [".mp3", ".wav", ".flac", ".aiff"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(ext)) {
      log("error", `Invalid file extension: ${ext}`);
      return NextResponse.json(
        { error: "Invalid file type. Supported: MP3, WAV, FLAC, AIFF" },
        { status: 400 }
      );
    }

    // Generate unique filenames
    const uuid = randomUUID();
    inputPath = join(TEMP_DIR, `input_${uuid}${ext}`);
    outputPath = join(TEMP_DIR, `output_${uuid}${ext}`);

    log("file", `Input path: ${inputPath}`);
    log("file", `Output path: ${outputPath}`);

    // Write uploaded file to disk
    log("file", "Writing uploaded file to disk...");
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(inputPath, buffer);
    const originalSize = buffer.length;
    log("file", `File written: ${originalSize} bytes`);

    // Verify file was written
    const inputStat = await stat(inputPath);
    log("file", `Input file verified: ${inputStat.size} bytes`);

    log("mmm", `Level requested: ${level}`);

    // Check if this is FFmpeg-only mode (skip MMM entirely)
    if (level === "ffmpeg-only") {
      log("ffmpeg", "FFmpeg-only mode - skipping MMM, applying pitch/tempo manipulation only");
      
      const ffmpegResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const ffmpegStartTime = Date.now();
        
        // Apply 2% pitch shift up, then compensate tempo back to original speed
        const ffmpegArgs: string[] = [
          "-i", inputPath as string,
          "-af", "asetrate=44100*1.02,aresample=44100,atempo=0.98",
          "-y",
          outputPath as string
        ];
        
        log("ffmpeg", `Executing: ffmpeg ${ffmpegArgs.join(" ")}`);
        
        const ffmpegProcess = spawn("ffmpeg", ffmpegArgs as readonly string[]);
        
        let ffmpegStderr = "";
        ffmpegProcess.stderr.on("data", (data: Buffer) => {
          ffmpegStderr += data.toString();
        });
        
        ffmpegProcess.on("close", (code: number | null) => {
          const duration = ((Date.now() - ffmpegStartTime) / 1000).toFixed(2);
          log("ffmpeg", `Process exited with code ${code} after ${duration}s`);
          if (code === 0) {
            resolve({ success: true });
          } else {
            log("ffmpeg:error", ffmpegStderr);
            resolve({ success: false, error: ffmpegStderr || `FFmpeg exited with code ${code}` });
          }
        });
        
        ffmpegProcess.on("error", (err: Error) => {
          log("ffmpeg:error", `Spawn error: ${err.message}`);
          resolve({ success: false, error: err.message });
        });
        
        setTimeout(() => {
          ffmpegProcess.kill();
          resolve({ success: false, error: "FFmpeg timeout (2 minutes)" });
        }, 2 * 60 * 1000);
      });
      
      if (!ffmpegResult.success) {
        log("error", `FFmpeg failed: ${ffmpegResult.error}`);
        return NextResponse.json(
          { error: ffmpegResult.error || "FFmpeg processing failed" },
          { status: 500 }
        );
      }
      
      // Check if output file exists
      log("file", "Checking for output file...");
      try {
        const outputStat = await stat(outputPath);
        log("file", `Output file found: ${outputStat.size} bytes`);
      } catch (e) {
        log("error", "Output file not found!");
        return NextResponse.json(
          { error: "Output file was not created by FFmpeg" },
          { status: 500 }
        );
      }
      
      // Read the cleaned file
      log("file", "Reading processed file...");
      const cleanedBuffer = await readFile(outputPath);
      const processingTime = (Date.now() - startTime) / 1000;
      
      log("complete", `Success! Original: ${originalSize} bytes, Cleaned: ${cleanedBuffer.length} bytes, Time: ${processingTime.toFixed(2)}s`);
      
      return new NextResponse(cleanedBuffer, {
        status: 200,
        headers: {
          "Content-Type": file.type || "audio/mpeg",
          "Content-Disposition": `attachment; filename="ffmpeg_${file.name}"`,
          "X-Processing-Time": processingTime.toString(),
          "X-Original-Size": originalSize.toString(),
        },
      });
    }

    // Build MMM command arguments (for non-ffmpeg-only modes)
    const args = ["obliterate", inputPath, "-o", outputPath];
    
    // Add level-specific flags based on cleaning intensity
    // Based on MMM documentation: aggressive flags (phase-dither, comb-mask, transient-shift) 
    // degrade audio and are NOT recommended. The "stealth-plus" preset works better.
    if (level === "paranoid") {
      // Stealth-plus preset: quality-preserving with maximum effectiveness
      // This approach achieved 88% on ElevenLabs detector (down from 98%)
      // Experimental flags made detection WORSE (back to 98%)
      args.push("--paranoid");
      args.push("--gated-resample-nudge");  // Ultra-tiny resample on high-energy segments
      args.push("--phase-noise");            // Tiny FFT phase noise
      args.push("--no-phase-dither");        // Disable - degrades audio
      args.push("--no-comb-mask");           // Disable - degrades audio
      args.push("--no-transient-shift");     // Disable - degrades audio
      args.push("--no-phase-swirl");         // Disable for stealth
      args.push("--no-masked-hf-phase");     // Disable
      args.push("--no-resample-nudge");      // Disable (gated version is better)
      args.push("--no-hf-decorrelate");      // Disable
      args.push("--no-micro-eq-flutter");    // Disable
      args.push("--no-refined-transient");   // Disable
      args.push("--no-adaptive-transient");  // Disable
      log("mmm", "Using STEALTH-PLUS mode (best: 88% on ElevenLabs)");
    } else if (level === "aggressive") {
      // Enable more experimental flags (may affect quality but more aggressive)
      args.push("--paranoid");
      args.push("--gated-resample-nudge");
      args.push("--phase-noise");
      args.push("--adaptive-transient");     // Onset-strength adaptive micro-shifts
      args.push("--micro-eq-flutter");       // RMS-gated band flutter
      args.push("--no-phase-dither");
      args.push("--no-comb-mask");
      args.push("--no-transient-shift");
      log("mmm", "Using AGGRESSIVE mode with additional stealth options");
    } else if (level === "moderate") {
      args.push("--paranoid");
      args.push("--phase-noise");
      log("mmm", "Using MODERATE mode with phase noise");
    } else {
      // Gentle - just basic metadata removal
      log("mmm", "Using GENTLE mode with minimal processing");
    }
    
    if (turbo) {
      args.push("--turbo");
    }
    
    if (verify) {
      args.push("--verify");
    }

    log("mmm", `Executing: mmm ${args.join(" ")}`);
    const mmmStartTime = Date.now();

    // Execute MMM command
    const result = await new Promise<{ success: boolean; error?: string; stdout?: string; stderr?: string }>((resolve) => {
      const process = spawn("mmm", args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true, // Use shell to ensure command is found
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        log("mmm:stdout", chunk.trim());
      });

      process.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        log("mmm:stderr", chunk.trim());
      });

      process.on("close", (code) => {
        const duration = ((Date.now() - mmmStartTime) / 1000).toFixed(2);
        log("mmm", `Process exited with code ${code} after ${duration}s`);
        if (code === 0) {
          resolve({ success: true, stdout, stderr });
        } else {
          resolve({ success: false, error: stderr || stdout || `Process exited with code ${code}`, stdout, stderr });
        }
      });

      process.on("error", (err) => {
        log("mmm:error", `Spawn error: ${err.message}`);
        resolve({ success: false, error: err.message });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        log("mmm:timeout", "Process timeout - killing");
        process.kill();
        resolve({ success: false, error: "Processing timeout (5 minutes)" });
      }, 5 * 60 * 1000);
    });

    if (!result.success) {
      log("error", `MMM failed: ${result.error}`);
      return NextResponse.json(
        { error: result.error || "Audio processing failed", stdout: result.stdout, stderr: result.stderr },
        { status: 500 }
      );
    }

    // Check if output file exists
    log("file", "Checking for output file...");
    try {
      const outputStat = await stat(outputPath);
      log("file", `Output file found: ${outputStat.size} bytes`);
    } catch (e) {
      log("error", "Output file not found!");
      return NextResponse.json(
        { error: "Output file was not created by MMM", stdout: result.stdout, stderr: result.stderr },
        { status: 500 }
      );
    }

    // FFmpeg Post-Processing: Apply subtle pitch/tempo modification for enhanced detection evasion
    // This is an anti-forensic technique that breaks acoustic fingerprint patterns
    if (level === "paranoid") {
      log("ffmpeg", "Applying enhanced anti-detection (pitch/tempo modification)...");
      const ffmpegOutputPath = join(TEMP_DIR, `ffmpeg_${uuid}${ext}`);
      
      const ffmpegResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const ffmpegStartTime = Date.now();
        
        // Apply 2% pitch shift up, then compensate tempo back to original speed
        // This subtly alters the spectral characteristics without noticeable quality change
        const ffmpegArgs: string[] = [
          "-i", outputPath as string,
          "-af", "asetrate=44100*1.02,aresample=44100,atempo=0.98",
          "-y",  // Overwrite output
          ffmpegOutputPath
        ];
        
        log("ffmpeg", `Executing: ffmpeg ${ffmpegArgs.join(" ")}`);
        
        const ffmpegProcess = spawn("ffmpeg", ffmpegArgs as readonly string[]);
        
        let ffmpegStderr = "";
        ffmpegProcess.stderr.on("data", (data: Buffer) => {
          ffmpegStderr += data.toString();
        });
        
        ffmpegProcess.on("close", (code: number | null) => {
          const duration = ((Date.now() - ffmpegStartTime) / 1000).toFixed(2);
          log("ffmpeg", `Process exited with code ${code} after ${duration}s`);
          if (code === 0) {
            resolve({ success: true });
          } else {
            log("ffmpeg:error", ffmpegStderr);
            resolve({ success: false, error: ffmpegStderr || `FFmpeg exited with code ${code}` });
          }
        });
        
        ffmpegProcess.on("error", (err: Error) => {
          log("ffmpeg:error", `Spawn error: ${err.message}`);
          resolve({ success: false, error: err.message });
        });
        
        // Timeout after 2 minutes
        setTimeout(() => {
          ffmpegProcess.kill();
          resolve({ success: false, error: "FFmpeg timeout (2 minutes)" });
        }, 2 * 60 * 1000);
      });
      
      if (ffmpegResult.success) {
        // Replace output with FFmpeg-processed version
        try {
          await unlink(outputPath);
          const { rename } = await import("fs/promises");
          await rename(ffmpegOutputPath, outputPath);
          log("ffmpeg", "Enhanced anti-detection applied successfully");
        } catch (e) {
          log("ffmpeg:warning", "Could not replace output file, using MMM output only");
          await unlink(ffmpegOutputPath).catch(() => {});
        }
      } else {
        log("ffmpeg:warning", `FFmpeg failed: ${ffmpegResult.error}, continuing with MMM output only`);
      }
    }

    // Read the cleaned file
    log("file", "Reading cleaned file...");
    const cleanedBuffer = await readFile(outputPath);
    const processingTime = (Date.now() - startTime) / 1000;

    log("complete", `Success! Original: ${originalSize} bytes, Cleaned: ${cleanedBuffer.length} bytes, Time: ${processingTime.toFixed(2)}s`);

    // Create response with file
    const response = new NextResponse(cleanedBuffer, {
      status: 200,
      headers: {
        "Content-Type": file.type || "audio/mpeg",
        "Content-Disposition": `attachment; filename="cleaned_${file.name}"`,
        "X-Processing-Time": processingTime.toString(),
        "X-Original-Size": originalSize.toString(),
      },
    });

    return response;
  } catch (error) {
    log("error", "Unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  } finally {
    // Cleanup temp files
    log("cleanup", "Cleaning up temp files...");
    try {
      if (inputPath) await unlink(inputPath).catch(() => {});
      if (outputPath) await unlink(outputPath).catch(() => {});
      log("cleanup", "Done");
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

