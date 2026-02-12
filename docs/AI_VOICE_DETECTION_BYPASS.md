# Defeating AI Voice Detection

This document explains the process for removing AI fingerprints from ElevenLabs TTS audio to bypass AI speech detection systems.

## Overview

ElevenLabs and other TTS providers embed acoustic fingerprints in generated audio that AI detection systems can identify. Our two-step process removes these fingerprints, achieving **98% → 2% detection rate** on the ElevenLabs classifier.

## The Solution: MMM + FFmpeg

### Step 1: MMM (Melodic Metadata Massacrer)

- Removes metadata, watermarks, and AI fingerprints
- Uses "stealth-plus" preset for quality preservation
- Requires GPU for fast processing (700x speedup with CUDA)

### Step 2: FFmpeg Pitch/Tempo Manipulation

- Applies subtle 2% pitch shift with tempo compensation
- Breaks acoustic fingerprint patterns undetectable by MMM alone
- Fast, CPU-only operation

## Results

| Configuration    | ElevenLabs Detection |
| ---------------- | -------------------- |
| Original audio   | 98%                  |
| MMM only         | 88%                  |
| FFmpeg only      | 98% (no improvement) |
| **MMM + FFmpeg** | **2%** ✅            |

## Usage

### DevTools Tester

1. Go to DevTools → Audio Cleaning
2. Upload audio file
3. Select **"Paranoid - Maximum (MMM + FFmpeg)"**
4. Enable GPU Turbo
5. Process and download

### Command Line (GPU)

```bash
# Step 1: MMM with stealth-plus preset
mmm obliterate input.mp3 -o intermediate.mp3 --paranoid --turbo \
  --gated-resample-nudge --phase-noise \
  --no-phase-dither --no-comb-mask --no-transient-shift \
  --no-phase-swirl --no-masked-hf-phase --no-resample-nudge \
  --no-hf-decorrelate --no-micro-eq-flutter \
  --no-refined-transient --no-adaptive-transient

# Step 2: FFmpeg pitch/tempo
ffmpeg -i intermediate.mp3 -af "asetrate=44100*1.02,aresample=44100,atempo=0.98" output.mp3
```

## Processing Time

| Audio Duration | With GPU | CPU Only   |
| -------------- | -------- | ---------- |
| 30 seconds     | ~10s     | ~30s       |
| 5 minutes      | ~30s     | ~2-3 min   |
| 1 hour         | ~3-5 min | ~20-30 min |

## Production Integration

**Recommended approach**: Run on GCP RTX 6000 VM

1. Spin up VM after video generation completes
2. Run MMM+FFmpeg on final audio track (~3-5 min for 1 hour)
3. Shutdown VM immediately
4. Cost: ~$0.10-0.20 per video

## Technical Details

### Why Both Steps Are Required

- **MMM alone (88%)**: Removes metadata and watermarks but misses acoustic fingerprints embedded in the waveform
- **FFmpeg alone (98%)**: Modifies the waveform but doesn't remove metadata/watermarks that detectors use
- **Combined (2%)**: MMM cleans metadata/watermarks, FFmpeg disrupts acoustic patterns

### What MMM Does (Stealth-Plus Mode)

- Complete metadata annihilation
- Spectral modification with FFT phase noise
- Gated resample nudge on high-energy segments
- Multiple processing passes

### What FFmpeg Does

- 2% sample rate increase (pitch up)
- Resample back to 44.1kHz
- 2% tempo decrease (compensate duration)
- Result: Subtle spectral alteration

## Dependencies

- **Python 3.8+** (for MMM)
- **CUDA** (for GPU acceleration)
- **FFmpeg** (pre-installed on most systems)
- **cupy-cuda12x** (for GPU support)
- **resampy** (for audio resampling)

## Limitations

- This bypasses the ElevenLabs speech classifier specifically
- Other detection systems may use different methods
- Processing time scales linearly with audio duration
- GPU strongly recommended for production use
