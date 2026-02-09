---
name: typography
description: Text animations - typewriter effects, kinetic text, word reveals, text transitions
tags: typography, text, kinetic, typewriter, reveal, titles, words
---

# Typography & Text Animation Patterns

## Typewriter Effect

Reveal text character by character with a cursor.

```tsx
const TEXT = "Hello World";
const CHARS_PER_SECOND = 15;

const charsToShow = Math.floor((frame / fps) * CHARS_PER_SECOND);
const displayText = TEXT.slice(0, Math.min(charsToShow, TEXT.length));

const cursorOpacity = Math.floor(frame / 15) % 2 === 0 ? 1 : 0;

<span>
  {displayText}
  <span style={{ opacity: cursorOpacity }}>|</span>
</span>
```

## Word-by-Word Reveal

Reveal words with staggered entrance animations.

```tsx
const WORDS = TEXT.split(' ');
const FRAMES_PER_WORD = 8;

{WORDS.map((word, i) => {
  const wordStart = i * FRAMES_PER_WORD;
  const progress = spring({
    frame: frame - wordStart,
    fps,
    config: { damping: 18, stiffness: 80 }
  });
  
  const opacity = Math.max(0, progress);
  const translateY = interpolate(progress, [0, 1], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  return (
    <span style={{
      opacity,
      transform: `translateY(${translateY}px)`,
      display: 'inline-block',
      marginRight: 8,
    }}>
      {word}
    </span>
  );
})}
```

## Character Stagger Animation

Animate each character with staggered timing.

```tsx
const CHARS = TEXT.split('');
const STAGGER = 2; // frames between each character

{CHARS.map((char, i) => {
  const charDelay = i * STAGGER;
  const progress = spring({
    frame: frame - charDelay,
    fps,
    config: { damping: 15, stiffness: 100 }
  });
  
  const scale = interpolate(progress, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  return (
    <span style={{
      display: 'inline-block',
      transform: `scale(${scale})`,
    }}>
      {char === ' ' ? '\u00A0' : char}
    </span>
  );
})}
```

## Word Highlight Effect

Highlight words sequentially in a sentence.

```tsx
const WORDS = TEXT.split(' ');
const FRAMES_PER_WORD = 30;

const currentWordIndex = Math.floor(frame / FRAMES_PER_WORD);

{WORDS.map((word, i) => {
  const isHighlighted = i === currentWordIndex % WORDS.length;
  
  return (
    <span style={{
      color: isHighlighted ? '#FFD700' : '#FFFFFF',
      fontWeight: isHighlighted ? 700 : 400,
      transition: 'none', // Don't use CSS transitions
    }}>
      {word}{' '}
    </span>
  );
})}
```

## Text Scale Entrance

Large text scaling in from small.

```tsx
const scale = spring({
  frame,
  fps,
  config: { damping: 12, stiffness: 100 }
});

const blur = interpolate(scale, [0, 1], [10, 0], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

<h1 style={{
  transform: `scale(${scale})`,
  filter: `blur(${blur}px)`,
  fontSize: 72,
  fontWeight: 700,
}}>
  {TEXT}
</h1>
```

## Rotating Word Carousel

Cycle through words with crossfade.

```tsx
const WORDS = ['Innovation', 'Creativity', 'Excellence'];
const FRAMES_PER_WORD = 60;

const wordIndex = Math.floor(frame / FRAMES_PER_WORD) % WORDS.length;
const progress = (frame % FRAMES_PER_WORD) / FRAMES_PER_WORD;

// Fade out at end, fade in at start
const opacity = progress < 0.2 
  ? interpolate(progress, [0, 0.2], [0, 1])
  : progress > 0.8 
    ? interpolate(progress, [0.8, 1], [1, 0])
    : 1;

<span style={{ opacity }}>
  {WORDS[wordIndex]}
</span>
```

## Split Text Animation

Text that splits and animates from center.

```tsx
const firstHalf = TEXT.slice(0, Math.floor(TEXT.length / 2));
const secondHalf = TEXT.slice(Math.floor(TEXT.length / 2));

const separation = interpolate(frame, [0, 30, 90, 120], [50, 0, 0, 50], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

<div style={{ display: 'flex', overflow: 'hidden' }}>
  <span style={{ transform: `translateX(-${separation}px)` }}>{firstHalf}</span>
  <span style={{ transform: `translateX(${separation}px)` }}>{secondHalf}</span>
</div>
```
