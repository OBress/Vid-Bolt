/**
 * Audio Effect Presets
 * 
 * Pre-configured audio effect chains for common use cases.
 * These presets can be applied to audio clips with a single click.
 */

import type { AudioEffect } from '../types/audio-effects';
import { AudioEffectType, createAudioEffect } from '../types/audio-effects';

// ============================================================
// TYPES
// ============================================================

export interface AudioEffectPreset {
  id: string;
  name: string;
  description: string;
  category: 'voice' | 'music' | 'podcast' | 'creative' | 'utility' | 'documentary';
  icon: string; // Lucide icon name
  effects: AudioEffect[];
}

// ============================================================
// VOICE PRESETS
// ============================================================

const voiceClarityPreset: AudioEffectPreset = {
  id: 'voice-clarity',
  name: 'Voice Clarity',
  description: 'Enhance speech clarity with EQ and light compression',
  category: 'voice',
  icon: 'Mic',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 80, gain: 0, q: 0.7, enabled: true },
        { id: 'low', type: 'lowShelf', frequency: 200, gain: -2, q: 0.7, enabled: true },
        { id: 'mid', type: 'peaking', frequency: 2500, gain: 3, q: 1.5, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 5000, gain: 2, q: 1, enabled: true },
        { id: 'air', type: 'highShelf', frequency: 10000, gain: 1, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -18,
      ratio: 3,
      attack: 10,
      release: 150,
      knee: 6,
      makeupGain: 2,
      autoMakeup: false,
    } as any,
  ],
};

const voiceWarmthPreset: AudioEffectPreset = {
  id: 'voice-warmth',
  name: 'Warm Voice',
  description: 'Add warmth and richness to vocal recordings',
  category: 'voice',
  icon: 'Flame',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 60, gain: 0, q: 0.7, enabled: true },
        { id: 'warmth', type: 'lowShelf', frequency: 250, gain: 3, q: 0.7, enabled: true },
        { id: 'body', type: 'peaking', frequency: 400, gain: 1, q: 1, enabled: true },
        { id: 'cut', type: 'peaking', frequency: 3000, gain: -1, q: 1.5, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -20,
      ratio: 2.5,
      attack: 15,
      release: 200,
      knee: 10,
      makeupGain: 0,
      autoMakeup: true,
    } as any,
  ],
};

const deEsserPreset: AudioEffectPreset = {
  id: 'de-esser',
  name: 'De-Esser',
  description: 'Reduce harsh sibilance in vocal recordings',
  category: 'voice',
  icon: 'MessageSquare',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'sibilance1', type: 'peaking', frequency: 5500, gain: -4, q: 3, enabled: true },
        { id: 'sibilance2', type: 'peaking', frequency: 7500, gain: -3, q: 2, enabled: true },
        { id: 'sibilance3', type: 'peaking', frequency: 9000, gain: -2, q: 2, enabled: true },
      ],
      outputGain: 1,
    } as any,
  ],
};

// ============================================================
// PODCAST PRESETS
// ============================================================

const podcastVoicePreset: AudioEffectPreset = {
  id: 'podcast-voice',
  name: 'Podcast Voice',
  description: 'Broadcast-quality voice processing for podcasts',
  category: 'podcast',
  icon: 'Radio',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.NOISE_GATE, 0),
      threshold: -45,
      attack: 0.5,
      hold: 50,
      release: 150,
      range: -60,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 1),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 80, gain: 0, q: 0.7, enabled: true },
        { id: 'rumble', type: 'lowShelf', frequency: 120, gain: -3, q: 0.7, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 3500, gain: 2, q: 1.2, enabled: true },
        { id: 'clarity', type: 'peaking', frequency: 6000, gain: 1.5, q: 1, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 2),
      threshold: -20,
      ratio: 4,
      attack: 8,
      release: 120,
      knee: 4,
      makeupGain: 3,
      autoMakeup: false,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.LIMITER, 3),
      ceiling: -1,
      release: 100,
      lookahead: 5,
    } as any,
  ],
};

const interviewPreset: AudioEffectPreset = {
  id: 'interview',
  name: 'Interview Cleanup',
  description: 'Clean up interview audio with noise reduction and clarity',
  category: 'podcast',
  icon: 'Users',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.NOISE_GATE, 0),
      threshold: -40,
      attack: 1,
      hold: 100,
      release: 200,
      range: -50,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 1),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 100, gain: 0, q: 0.7, enabled: true },
        { id: 'mud', type: 'peaking', frequency: 300, gain: -2, q: 1, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 2800, gain: 2, q: 1.5, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 2),
      threshold: -24,
      ratio: 3,
      attack: 15,
      release: 180,
      knee: 8,
      makeupGain: 0,
      autoMakeup: true,
    } as any,
  ],
};

// ============================================================
// MUSIC PRESETS
// ============================================================

const musicMasterPreset: AudioEffectPreset = {
  id: 'music-master',
  name: 'Music Master',
  description: 'Light mastering chain for music tracks',
  category: 'music',
  icon: 'Music',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'sub', type: 'highpass', frequency: 30, gain: 0, q: 0.7, enabled: true },
        { id: 'bass', type: 'lowShelf', frequency: 100, gain: 1, q: 0.7, enabled: true },
        { id: 'highs', type: 'highShelf', frequency: 10000, gain: 1.5, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -12,
      ratio: 2,
      attack: 30,
      release: 300,
      knee: 10,
      makeupGain: 0,
      autoMakeup: true,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.STEREO_ENHANCER, 2),
      width: 110,
      midLevel: 0,
      sideLevel: 1,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.LIMITER, 3),
      ceiling: -0.3,
      release: 150,
      lookahead: 5,
    } as any,
  ],
};

const lofiPreset: AudioEffectPreset = {
  id: 'lofi',
  name: 'Lo-Fi',
  description: 'Vintage lo-fi sound with warmth and character',
  category: 'music',
  icon: 'Disc',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'lp', type: 'lowpass', frequency: 8000, gain: 0, q: 0.7, enabled: true },
        { id: 'bass', type: 'lowShelf', frequency: 200, gain: 2, q: 0.7, enabled: true },
        { id: 'mid', type: 'peaking', frequency: 800, gain: -2, q: 1, enabled: true },
      ],
      outputGain: -2,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.DISTORTION, 1),
      drive: 15,
      tone: -20,
      output: -3,
      distortionType: 'tube',
    } as any,
    {
      ...createAudioEffect(AudioEffectType.CHORUS, 2),
      rate: 0.3,
      depth: 30,
      delay: 15,
      feedback: 10,
      mix: 20,
    } as any,
  ],
};

// ============================================================
// CREATIVE PRESETS
// ============================================================

const telephonePreset: AudioEffectPreset = {
  id: 'telephone',
  name: 'Telephone',
  description: 'Classic telephone/radio effect',
  category: 'creative',
  icon: 'Phone',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 400, gain: 0, q: 1, enabled: true },
        { id: 'lp', type: 'lowpass', frequency: 3500, gain: 0, q: 1, enabled: true },
        { id: 'mid', type: 'peaking', frequency: 1500, gain: 6, q: 2, enabled: true },
      ],
      outputGain: -3,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.DISTORTION, 1),
      drive: 20,
      tone: 30,
      output: -6,
      distortionType: 'hard',
    } as any,
  ],
};

const concertHallPreset: AudioEffectPreset = {
  id: 'concert-hall',
  name: 'Concert Hall',
  description: 'Large concert hall reverb',
  category: 'creative',
  icon: 'Building',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.REVERB, 0),
      preset: 'hall',
      decay: 3,
      preDelay: 40,
      damping: 40,
      roomSize: 80,
      mix: 35,
    } as any,
  ],
};

const echoPreset: AudioEffectPreset = {
  id: 'echo',
  name: 'Echo Effect',
  description: 'Rhythmic echo/delay effect',
  category: 'creative',
  icon: 'Repeat',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.DELAY, 0),
      delayTime: 375, // 1/4 note at 160 BPM
      feedback: 45,
      highCut: 6000,
      lowCut: 300,
      mix: 40,
      pingPong: true,
    } as any,
  ],
};

const underwaterPreset: AudioEffectPreset = {
  id: 'underwater',
  name: 'Underwater',
  description: 'Muffled underwater sound effect',
  category: 'creative',
  icon: 'Waves',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'lp', type: 'lowpass', frequency: 800, gain: 0, q: 0.7, enabled: true },
        { id: 'boost', type: 'peaking', frequency: 300, gain: 4, q: 1, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.CHORUS, 1),
      rate: 0.5,
      depth: 60,
      delay: 20,
      feedback: 30,
      mix: 40,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.REVERB, 2),
      preset: 'large_room',
      decay: 2,
      preDelay: 10,
      damping: 70,
      roomSize: 60,
      mix: 30,
    } as any,
  ],
};

// ============================================================
// UTILITY PRESETS
// ============================================================

const noiseReductionPreset: AudioEffectPreset = {
  id: 'noise-reduction',
  name: 'Noise Reduction',
  description: 'Reduce background noise and hum',
  category: 'utility',
  icon: 'VolumeX',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.NOISE_GATE, 0),
      threshold: -35,
      attack: 0.5,
      hold: 30,
      release: 100,
      range: -70,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 1),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 80, gain: 0, q: 0.7, enabled: true },
        { id: 'hum1', type: 'notch', frequency: 50, gain: 0, q: 10, enabled: true },
        { id: 'hum2', type: 'notch', frequency: 60, gain: 0, q: 10, enabled: true },
        { id: 'hum3', type: 'notch', frequency: 100, gain: 0, q: 10, enabled: true },
      ],
      outputGain: 0,
    } as any,
  ],
};

const loudnessNormalizationPreset: AudioEffectPreset = {
  id: 'loudness-normalization',
  name: 'Loudness Normalization',
  description: 'Normalize loudness to broadcast standards',
  category: 'utility',
  icon: 'Activity',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 0),
      threshold: -24,
      ratio: 4,
      attack: 10,
      release: 150,
      knee: 6,
      makeupGain: 0,
      autoMakeup: true,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.LIMITER, 1),
      ceiling: -1,
      release: 100,
      lookahead: 5,
    } as any,
  ],
};

const volumeBoostPreset: AudioEffectPreset = {
  id: 'volume-boost',
  name: 'Volume Boost',
  description: 'Safely boost quiet audio',
  category: 'utility',
  icon: 'Volume2',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.GAIN, 0),
      gain: 6,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.LIMITER, 1),
      ceiling: -0.5,
      release: 100,
      lookahead: 3,
    } as any,
  ],
};

// ============================================================
// DOCUMENTARY / CONTENT CREATION PRESETS
// ============================================================

const narratorVoicePreset: AudioEffectPreset = {
  id: 'narrator-voice',
  name: 'Narrator Voice',
  description: 'Authoritative, clear documentary narration',
  category: 'documentary',
  icon: 'BookOpen',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 80, gain: 0, q: 0.7, enabled: true },
        { id: 'body', type: 'lowShelf', frequency: 180, gain: 2, q: 0.7, enabled: true },
        { id: 'mud', type: 'peaking', frequency: 350, gain: -1.5, q: 1.2, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 3200, gain: 2.5, q: 1.5, enabled: true },
        { id: 'clarity', type: 'peaking', frequency: 5500, gain: 1.5, q: 1.2, enabled: true },
        { id: 'air', type: 'highShelf', frequency: 12000, gain: 1, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -18,
      ratio: 3.5,
      attack: 8,
      release: 120,
      knee: 6,
      makeupGain: 2,
      autoMakeup: false,
    } as any,
  ],
};

const intimateWhisperPreset: AudioEffectPreset = {
  id: 'intimate-whisper',
  name: 'Intimate / Whisper',
  description: 'Close-up, ASMR-like breathy tone',
  category: 'documentary',
  icon: 'Heart',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 60, gain: 0, q: 0.7, enabled: true },
        { id: 'warmth', type: 'lowShelf', frequency: 200, gain: 4, q: 0.7, enabled: true },
        { id: 'breath', type: 'peaking', frequency: 800, gain: 2, q: 1, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 4000, gain: -1, q: 1.5, enabled: true },
        { id: 'air', type: 'highShelf', frequency: 8000, gain: 2.5, q: 0.7, enabled: true },
      ],
      outputGain: 3,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -30,
      ratio: 4,
      attack: 5,
      release: 100,
      knee: 10,
      makeupGain: 6,
      autoMakeup: false,
    } as any,
  ],
};

const newsreaderPreset: AudioEffectPreset = {
  id: 'newsreader',
  name: 'Newsreader',
  description: 'Broadcast-standard, neutral clarity',
  category: 'documentary',
  icon: 'Newspaper',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 100, gain: 0, q: 0.8, enabled: true },
        { id: 'low', type: 'lowShelf', frequency: 150, gain: -2, q: 0.7, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 2800, gain: 2, q: 1.5, enabled: true },
        { id: 'clarity', type: 'peaking', frequency: 5000, gain: 1, q: 1, enabled: true },
        { id: 'lp', type: 'lowpass', frequency: 14000, gain: 0, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -16,
      ratio: 4,
      attack: 5,
      release: 80,
      knee: 4,
      makeupGain: 0,
      autoMakeup: true,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.LIMITER, 2),
      ceiling: -1.5,
      release: 100,
      lookahead: 5,
    } as any,
  ],
};

const dramaticMomentPreset: AudioEffectPreset = {
  id: 'dramatic-moment',
  name: 'Dramatic Moment',
  description: 'Enhanced presence and impact for climactic scenes',
  category: 'documentary',
  icon: 'Flame',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 70, gain: 0, q: 0.7, enabled: true },
        { id: 'power', type: 'lowShelf', frequency: 150, gain: 3, q: 0.7, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 2500, gain: 3, q: 1.2, enabled: true },
        { id: 'edge', type: 'peaking', frequency: 4500, gain: 2, q: 1.5, enabled: true },
        { id: 'air', type: 'highShelf', frequency: 10000, gain: 1.5, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -14,
      ratio: 5,
      attack: 3,
      release: 100,
      knee: 4,
      makeupGain: 3,
      autoMakeup: false,
    } as any,
  ],
};

const radioAnnouncerPreset: AudioEffectPreset = {
  id: 'radio-announcer',
  name: 'Radio Announcer',
  description: 'Punchy, commercial-style voice for promos',
  category: 'documentary',
  icon: 'Radio',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 90, gain: 0, q: 0.8, enabled: true },
        { id: 'bass', type: 'lowShelf', frequency: 200, gain: 3, q: 0.7, enabled: true },
        { id: 'punch', type: 'peaking', frequency: 250, gain: 2, q: 1.5, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 3500, gain: 4, q: 1.2, enabled: true },
        { id: 'sizzle', type: 'highShelf', frequency: 8000, gain: 2, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -20,
      ratio: 6,
      attack: 2,
      release: 60,
      knee: 2,
      makeupGain: 4,
      autoMakeup: false,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.LIMITER, 2),
      ceiling: -0.5,
      release: 80,
      lookahead: 3,
    } as any,
  ],
};

const natureDocumentaryPreset: AudioEffectPreset = {
  id: 'nature-documentary',
  name: 'Nature Documentary',
  description: 'Warm and soothing David Attenborough-style tone',
  category: 'documentary',
  icon: 'TreePine',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 70, gain: 0, q: 0.7, enabled: true },
        { id: 'warmth', type: 'lowShelf', frequency: 220, gain: 3, q: 0.7, enabled: true },
        { id: 'fullness', type: 'peaking', frequency: 500, gain: 1, q: 1, enabled: true },
        { id: 'clarity', type: 'peaking', frequency: 3000, gain: 1.5, q: 1.5, enabled: true },
        { id: 'smooth', type: 'peaking', frequency: 6000, gain: -1, q: 1.2, enabled: true },
        { id: 'air', type: 'highShelf', frequency: 12000, gain: 0.5, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -22,
      ratio: 2.5,
      attack: 15,
      release: 200,
      knee: 10,
      makeupGain: 0,
      autoMakeup: true,
    } as any,
  ],
};

const sportsCommentatorPreset: AudioEffectPreset = {
  id: 'sports-commentator',
  name: 'Sports Commentator',
  description: 'Energetic with cut-through clarity for action content',
  category: 'documentary',
  icon: 'Trophy',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 120, gain: 0, q: 0.8, enabled: true },
        { id: 'cut', type: 'peaking', frequency: 400, gain: -2, q: 1.2, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 3000, gain: 4, q: 1.2, enabled: true },
        { id: 'clarity', type: 'peaking', frequency: 5500, gain: 3, q: 1.5, enabled: true },
        { id: 'air', type: 'highShelf', frequency: 10000, gain: 2, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -18,
      ratio: 5,
      attack: 2,
      release: 50,
      knee: 3,
      makeupGain: 3,
      autoMakeup: false,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.LIMITER, 2),
      ceiling: -1,
      release: 50,
      lookahead: 3,
    } as any,
  ],
};

const cinematicVillainPreset: AudioEffectPreset = {
  id: 'cinematic-villain',
  name: 'Cinematic Villain',
  description: 'Deep, menacing tone for character voice work',
  category: 'documentary',
  icon: 'Skull',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 50, gain: 0, q: 0.7, enabled: true },
        { id: 'depth', type: 'lowShelf', frequency: 150, gain: 5, q: 0.7, enabled: true },
        { id: 'rumble', type: 'peaking', frequency: 100, gain: 3, q: 1, enabled: true },
        { id: 'cut', type: 'peaking', frequency: 3500, gain: -2, q: 1.5, enabled: true },
        { id: 'lp', type: 'lowpass', frequency: 8000, gain: 0, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 1),
      threshold: -20,
      ratio: 4,
      attack: 10,
      release: 150,
      knee: 8,
      makeupGain: 0,
      autoMakeup: true,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.REVERB, 2),
      preset: 'small_room',
      decay: 0.8,
      preDelay: 10,
      damping: 60,
      roomSize: 30,
      mix: 10,
    } as any,
  ],
};

const vintageNewsreelPreset: AudioEffectPreset = {
  id: 'vintage-newsreel',
  name: 'Vintage Newsreel',
  description: '1940s-50s radio tone for historical content',
  category: 'documentary',
  icon: 'Film',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 300, gain: 0, q: 0.8, enabled: true },
        { id: 'lp', type: 'lowpass', frequency: 4000, gain: 0, q: 0.8, enabled: true },
        { id: 'mid', type: 'peaking', frequency: 1200, gain: 5, q: 1.5, enabled: true },
        { id: 'nasal', type: 'peaking', frequency: 2000, gain: 3, q: 2, enabled: true },
      ],
      outputGain: -2,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.DISTORTION, 1),
      drive: 10,
      tone: -10,
      output: -3,
      distortionType: 'tube',
    } as any,
  ],
};

const podcastSoloPreset: AudioEffectPreset = {
  id: 'podcast-solo',
  name: 'Podcast Solo',
  description: 'Optimized for single speaker content creation',
  category: 'documentary',
  icon: 'Mic2',
  effects: [
    {
      ...createAudioEffect(AudioEffectType.NOISE_GATE, 0),
      threshold: -42,
      attack: 0.5,
      hold: 40,
      release: 120,
      range: -55,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 1),
      bands: [
        { id: 'hp', type: 'highpass', frequency: 80, gain: 0, q: 0.7, enabled: true },
        { id: 'rumble', type: 'lowShelf', frequency: 120, gain: -2, q: 0.7, enabled: true },
        { id: 'mud', type: 'peaking', frequency: 300, gain: -1.5, q: 1.2, enabled: true },
        { id: 'presence', type: 'peaking', frequency: 3200, gain: 2.5, q: 1.5, enabled: true },
        { id: 'clarity', type: 'peaking', frequency: 6000, gain: 1.5, q: 1.2, enabled: true },
        { id: 'air', type: 'highShelf', frequency: 12000, gain: 1, q: 0.7, enabled: true },
      ],
      outputGain: 0,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.COMPRESSOR, 2),
      threshold: -20,
      ratio: 3.5,
      attack: 8,
      release: 120,
      knee: 6,
      makeupGain: 2,
      autoMakeup: false,
    } as any,
    {
      ...createAudioEffect(AudioEffectType.LIMITER, 3),
      ceiling: -1,
      release: 100,
      lookahead: 5,
    } as any,
  ],
};

// ============================================================
// EXPORTS
// ============================================================

export const AUDIO_EFFECT_PRESETS: AudioEffectPreset[] = [
  // Voice
  voiceClarityPreset,
  voiceWarmthPreset,
  deEsserPreset,
  // Podcast
  podcastVoicePreset,
  interviewPreset,
  // Documentary / Content Creation
  narratorVoicePreset,
  intimateWhisperPreset,
  newsreaderPreset,
  dramaticMomentPreset,
  radioAnnouncerPreset,
  natureDocumentaryPreset,
  sportsCommentatorPreset,
  cinematicVillainPreset,
  vintageNewsreelPreset,
  podcastSoloPreset,
  // Music
  musicMasterPreset,
  lofiPreset,
  // Creative
  telephonePreset,
  concertHallPreset,
  echoPreset,
  underwaterPreset,
  // Utility
  noiseReductionPreset,
  loudnessNormalizationPreset,
  volumeBoostPreset,
];

/**
 * Get presets by category
 */
export function getPresetsByCategory(): Record<string, AudioEffectPreset[]> {
  const categories: Record<string, AudioEffectPreset[]> = {};
  
  AUDIO_EFFECT_PRESETS.forEach(preset => {
    if (!categories[preset.category]) {
      categories[preset.category] = [];
    }
    categories[preset.category].push(preset);
  });
  
  return categories;
}

/**
 * Get preset by ID
 */
export function getPresetById(id: string): AudioEffectPreset | undefined {
  return AUDIO_EFFECT_PRESETS.find(p => p.id === id);
}

/**
 * Apply a preset to get effect instances with new IDs
 */
export function applyPreset(presetId: string): AudioEffect[] {
  const preset = getPresetById(presetId);
  if (!preset) return [];
  
  // Clone effects with new IDs
  return preset.effects.map((effect, index) => ({
    ...effect,
    id: `audio-effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    order: index,
    expanded: true,
  }));
}

/**
 * Category display names
 */
export const PRESET_CATEGORY_NAMES: Record<string, string> = {
  voice: 'Voice',
  podcast: 'Podcast',
  documentary: 'Documentary',
  music: 'Music',
  creative: 'Creative',
  utility: 'Utility',
};
