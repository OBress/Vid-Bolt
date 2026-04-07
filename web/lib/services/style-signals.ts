const NON_PHOTOREALISTIC_STYLE_PATTERN = /\b(clay|claymation|stop(?:\s|-)?motion|cartoon|animation|animated|anime|manga|comic|graphic novel|illustration|illustrated|sketch|ink(?:ed)?|watercolor|gouache|oil(?:\s|-)?paint|painted|pixel(?:\s|-)?art|voxel|low(?:\s|-)?poly|blender|3d render|3d-render|stylized|handcrafted)\b/i;
const HISTORICAL_STYLE_PATTERN = /\b(ancient|roman|rome|greek|greece|medieval|renaissance|victorian|edwardian|18th century|19th century|1800s|1900s|world war|wwi|wwii|period piece|historical)\b/i;

export interface StyleSignals {
  corpus: string;
  nonPhotorealistic: boolean;
  historical: boolean;
}

export function buildStyleCorpus(...parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getStyleSignals(...parts: Array<string | undefined>): StyleSignals {
  const corpus = buildStyleCorpus(...parts);
  return {
    corpus,
    nonPhotorealistic: NON_PHOTOREALISTIC_STYLE_PATTERN.test(corpus),
    historical: HISTORICAL_STYLE_PATTERN.test(corpus),
  };
}

export function getDefaultQualityAnchorsForStyle(...parts: Array<string | undefined>): string[] {
  const signals = getStyleSignals(...parts);

  if (signals.nonPhotorealistic && signals.historical) {
    return [
      'cohesive stylized rendering',
      'period-authentic details',
      'handcrafted materials',
      'era-appropriate costumes',
    ];
  }

  if (signals.nonPhotorealistic) {
    return [
      'cohesive stylized rendering',
      'clear silhouettes',
      'handcrafted textures',
      'consistent art direction',
    ];
  }

  if (signals.historical) {
    return [
      'period-authentic details',
      'believable materials',
      'era-appropriate costumes',
      'cohesive lighting',
    ];
  }

  return [
    'cinematic composition',
    'high detail',
    'cohesive lighting',
    'polished finish',
  ];
}
