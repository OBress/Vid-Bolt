---
name: messaging
description: Chat and messaging UI patterns - WhatsApp, iMessage, chat bubbles, conversations
tags: chat, messaging, whatsapp, imessage, bubbles, conversation, sms
---

# Chat & Messaging UI Patterns

## Chat Bubble Layout

Use flexbox to align sent messages right, received messages left.

**Incorrect (all bubbles centered):**
```tsx
<div style={{ textAlign: "center" }}>
  {messages.map(msg => <div>{msg.text}</div>)}
</div>
```

**Correct (proper chat alignment):**
```tsx
<div style={{
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  padding: 40,
  height: "100%",
}}>
  {messages.map((msg, i) => (
    <div style={{
      display: "flex",
      justifyContent: msg.sent ? "flex-end" : "flex-start",
      marginTop: 12
    }}>
      <div style={{
        maxWidth: "70%",
        padding: "12px 16px",
        borderRadius: 16,
        backgroundColor: msg.sent ? "#1f8a70" : "#202c33",
        color: "#e9edef"
      }}>
        {msg.text}
      </div>
    </div>
  ))}
</div>
```

## Staggered Message Entrances

Messages should appear one by one with slide + fade animations.

```tsx
const MESSAGES = [
  { text: "Hey! How are you?", sent: false },
  { text: "I'm good! You?", sent: true },
  { text: "Great! Want to meet up?", sent: false },
];

const STAGGER_DELAY = 38;
const FADE_DURATION = 18;

{MESSAGES.map((msg, i) => {
  const startFrame = i * STAGGER_DELAY;
  const opacity = interpolate(frame - startFrame, [0, FADE_DURATION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const slideX = interpolate(opacity, [0, 1], [msg.sent ? 40 : -40, 0]);

  return (
    <div style={{
      opacity,
      transform: `translateX(${slideX}px)`,
    }}>
      {/* bubble content */}
    </div>
  );
})}
```

## Spring Bounce on Bubble Entrance

```tsx
const bounce = spring({
  frame: frame - startFrame,
  fps,
  config: { damping: 12, stiffness: 170 }
});
const scaleValue = interpolate(bounce, [0, 1], [0.98, 1]);

<div style={{
  transform: `translateX(${slideX}px) scale(${scaleValue})`,
  transformOrigin: msg.sent ? "100% 100%" : "0% 100%"
}}>
```

## WhatsApp Dark Theme Colors

```tsx
const COLOR_BACKGROUND = "#0b141a";
const COLOR_SENT = "#1f8a70";      // Green for sent
const COLOR_RECEIVED = "#202c33"; // Dark gray for received
const COLOR_TEXT = "#e9edef";     // Light text
const COLOR_TIMESTAMP = "#8696a0"; // Subtle timestamp
```

## iMessage Light Theme Colors

```tsx
const COLOR_BACKGROUND = "#ffffff";
const COLOR_SENT = "#007AFF";     // Blue for sent
const COLOR_RECEIVED = "#E9E9EB"; // Light gray for received
const COLOR_TEXT_SENT = "#ffffff";
const COLOR_TEXT_RECEIVED = "#000000";
```

## Typing Indicator

```tsx
const DOT_COUNT = 3;
const DOT_SIZE = 8;

<div style={{ display: 'flex', gap: 4, padding: 12 }}>
  {Array.from({ length: DOT_COUNT }).map((_, i) => {
    const delay = i * 8;
    const bounce = Math.sin((frame - delay) * 0.2) * 4;
    
    return (
      <div style={{
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: '50%',
        backgroundColor: '#8696a0',
        transform: `translateY(${bounce}px)`,
      }} />
    );
  })}
</div>
```
