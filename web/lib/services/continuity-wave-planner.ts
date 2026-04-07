export interface VideoWaveShotLike {
  segment_index: number;
  synthesis_mode?: string;
  angle_change?: string;
  continuity_from_previous?: boolean;
}

export interface WaveDependency {
  shotIndex: number;
  parentShotIndex: number;
}

export interface VideoGenerationWave {
  index: number;
  shotIndices: number[];
  continuityDependencies: WaveDependency[];
}

function hasContinuityDependency(
  shot: VideoWaveShotLike,
  validShotIndices: Set<number>,
): boolean {
  if (!shot.continuity_from_previous) return false;
  if (shot.synthesis_mode !== 'I2V') return false;
  if (!shot.angle_change?.trim()) return false;

  return validShotIndices.has(shot.segment_index - 1);
}

export function buildVideoGenerationWaves(
  shots: VideoWaveShotLike[],
): VideoGenerationWave[] {
  const sortedShots = [...shots].sort((a, b) => a.segment_index - b.segment_index);
  const validShotIndices = new Set(sortedShots.map(shot => shot.segment_index));
  const waveByShot = new Map<number, number>();
  const dependencies = new Map<number, number>();

  for (const shot of sortedShots) {
    if (hasContinuityDependency(shot, validShotIndices)) {
      const parentShotIndex = shot.segment_index - 1;
      dependencies.set(shot.segment_index, parentShotIndex);
      const parentWave = waveByShot.get(parentShotIndex) ?? 0;
      waveByShot.set(shot.segment_index, parentWave + 1);
      continue;
    }

    waveByShot.set(shot.segment_index, 0);
  }

  const waves = new Map<number, VideoGenerationWave>();
  for (const shot of sortedShots) {
    const waveIndex = waveByShot.get(shot.segment_index) ?? 0;
    const current = waves.get(waveIndex) || {
      index: waveIndex,
      shotIndices: [],
      continuityDependencies: [],
    };
    current.shotIndices.push(shot.segment_index);

    const parentShotIndex = dependencies.get(shot.segment_index);
    if (typeof parentShotIndex === 'number') {
      current.continuityDependencies.push({
        shotIndex: shot.segment_index,
        parentShotIndex,
      });
    }

    waves.set(waveIndex, current);
  }

  return [...waves.values()].sort((a, b) => a.index - b.index);
}
