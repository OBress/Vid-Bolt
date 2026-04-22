/**
 * Format Profile Registry
 * ============================================================================
 * Natural language editorial briefs per video genre.
 *
 * These are NOT constraint systems — they are creative context that the LLM
 * reads and reasons against. No numeric targets, no hard rules.
 * The LLM uses its full creative vocabulary to honour the editorial character
 * described here.
 *
 * To add a new genre: add a new key to FORMAT_PROFILES with a FormatProfile.
 * The decomposer picks it up automatically via buildContextFromManifest().
 */

export interface FormatProfile {
  name: string;
  /** Overall editorial character — what this format feels like at its best. */
  editorialBrief: string;
  /** How this format's opening hook should work. */
  hookGuidance: string;
  /** The emotional and rhythmic character of pacing across the video. */
  pacingCharacter: string;
  /** The philosophical role of B-roll in this format. */
  brollPhilosophy: string;
  /**
   * When and how individual human perspective matters.
   * Not a rule — a lens the LLM uses to ask "does this moment need a human face?"
   */
  humanPerspectiveGuidance: string;
  /** How motion graphics fit — their weight relative to footage. */
  mgPhilosophy: string;
}

export const FORMAT_PROFILES: Record<string, FormatProfile> = {

  documentary: {
    name: 'documentary',
    editorialBrief:
      'This is a premium, investigative documentary. Every editorial decision serves ' +
      'a single purpose: making the viewer feel like they were there. The visual story ' +
      'is not decoration for the narration — it IS the narration. If the footage can ' +
      'say it, the narration shouldn\'t have to.',
    hookGuidance:
      'The hook drops the viewer into the middle of something — a consequence, a mystery, ' +
      'a contradiction — before any context is given. Do not explain. Intrigue first. ' +
      'Rapid intercutting between reconstruction and archival is a proven documentary hook: ' +
      'each archival cut validates the preceding reconstruction and grounds the abstraction ' +
      'in reality. Start fast, earn the slower observational sections that follow.',
    pacingCharacter:
      'A documentary breathes through contrast. Rapid archival-cut passages earn their speed ' +
      'by being preceded by something slow and observational — and vice versa. A grief scene ' +
      'should have longer holds than the surrounding investigative sections, not because it is ' +
      'slow by default, but because it has earned the right to take time. Evidence lands when ' +
      'given space to exist. Revelation is held long enough to mean something. The edit is a ' +
      'conversation between tension and release. That contrast is the mechanism — not any ' +
      'individual shot length in isolation.',
    brollPhilosophy:
      'B-roll is the primary visual language. It carries the emotional weight the narrator ' +
      'describes. A wide shot of a location is not B-roll — it is a statement. Choose every ' +
      'shot as if it is the only thing the viewer will remember about this moment. ' +
      'When using archival stills, apply ken_burns camera motion to give them life — ' +
      'slow, graceful pan+zoom treats historical material with the weight it deserves ' +
      'and keeps the image active rather than static.',
    humanPerspectiveGuidance:
      'Whenever the narration describes something that happened to a person, ask: can the ' +
      'viewer see it through that person\'s eyes, even briefly? Abstract facts become human ' +
      'when grounded in a specific individual\'s experience. A death toll is a number. ' +
      'A person looking out a window as fire approaches is something the viewer will carry. ' +
      'Tools: first_person camera angle for eyewitness immersion; foreground-subject with ' +
      'background-event framing; and always — reaction shot BEFORE the reveal, not after.',
    mgPhilosophy:
      'Motion graphics are almost never the right choice for emotional or dramatic beats. ' +
      'Their correct role is purely informational: data that cannot be filmed, geography that ' +
      'requires a map, abstract systems that need a diagram, timelines, evidence relationships. ' +
      'Annotation-style templates (slap_annotation, quote_card, lower_third) that merely label ' +
      'what the narrator is already saying are noise, not information. The test: does this MG ' +
      'add something footage genuinely cannot show? If not, find a stronger visual instead.',
  },

  true_crime: {
    name: 'true_crime',
    editorialBrief:
      'True crime operates on controlled suspense. Every scene either deepens the mystery, ' +
      'raises the stakes, or delivers a revelation. The viewer is always asking "why" and ' +
      '"what happened next." Never let them stop asking.',
    hookGuidance:
      'Open with the consequence or the contradiction — the thing that doesn\'t add up, ' +
      'the outcome that demands explanation. Drop the viewer into unease before comfort.',
    pacingCharacter:
      'Investigation scenes build methodically — evidence stacks, tension coils. ' +
      'Revelation scenes are percussive — fast cuts, hard facts, no breathing room. ' +
      'The contrast between slow investigation and fast payoff is the engine of the format.',
    brollPhilosophy:
      'B-roll should feel like forensic observation — clinical, precise, attentive to detail. ' +
      'Objects matter. Locations carry history. The camera notices what the perpetrator ' +
      'thought no one would notice.',
    humanPerspectiveGuidance:
      'Victims are not statistics. Whenever a victim, a witness, or a perpetrator is named, ' +
      'that name should attach to a visual experience — not just text over a photo. ' +
      'The viewer needs to feel what was lost, not just understand what happened.',
    mgPhilosophy:
      'Evidence boards, timelines, and document callouts are natural to this format. ' +
      'Use them to surface information the footage can\'t show — but let footage carry ' +
      'the emotional weight. An MG that replaces a powerful visual moment is a missed opportunity.',
  },

  explainer: {
    name: 'explainer',
    editorialBrief:
      'An explainer earns attention by being relentlessly clear and forward-moving. ' +
      'The viewer came to understand something. Every second they spend confused is a ' +
      'second they might leave. Clarity is the aesthetic.',
    hookGuidance:
      'State the payoff immediately — what will the viewer understand by the end that ' +
      'they don\'t understand now? The hook is a promise. Make it specific and compelling.',
    pacingCharacter:
      'Explainers move briskly. No scene overstays its welcome. Once a concept is clear, ' +
      'move on. Tension is created by raising the next question before fully answering the last.',
    brollPhilosophy:
      'B-roll illustrates. It makes abstract concepts concrete — a visualization of a ' +
      'process, an example of a principle. It doesn\'t need to be cinematic; it needs to ' +
      'be accurate to the concept being explained.',
    humanPerspectiveGuidance:
      'Human examples make abstract systems relatable. When a concept applies to a person\'s ' +
      'life, show that person experiencing it — even briefly. The audience is a human; ' +
      'they understand the world through other humans.',
    mgPhilosophy:
      'Motion graphics are a primary tool here — diagrams, comparisons, process flows. ' +
      'They should be clean, readable, and information-dense. Never decorative without function.',
  },

  vlog: {
    name: 'vlog',
    editorialBrief:
      'A vlog is a window into a life or perspective. Authenticity is the currency. ' +
      'The viewer is not watching because the production is polished — they\'re watching ' +
      'because they trust the voice and want to spend time with it.',
    hookGuidance:
      'Drop into an interesting moment or a compelling question. Vlogs hook through ' +
      'personal energy and specificity — not through mystery or technique.',
    pacingCharacter:
      'Conversational rhythm. The edit follows the person, not the other way around. ' +
      'Upbeat sections move quickly; reflective sections breathe. Match the edit to mood.',
    brollPhilosophy:
      'B-roll here is life footage — the environment, the activity, the context of what\'s ' +
      'being discussed. It grounds the narrator in a real place and time.',
    humanPerspectiveGuidance:
      'The narrator IS the human perspective. Supporting characters — friends, family, ' +
      'strangers — should appear as specific individuals, not generics.',
    mgPhilosophy:
      'Light touch. Text overlays for emphasis, occasional lower thirds, nothing that ' +
      'feels like a production. If an MG feels like it belongs in a news broadcast, it\'s wrong.',
  },

  biography: {
    name: 'biography',
    editorialBrief:
      'A biography is the story of how a person became who they were. The visual story ' +
      'must honour both the public record and the private human — the events and the ' +
      'feelings those events produced. Character is the through-line.',
    hookGuidance:
      'Open at a pivotal moment — a decision, a consequence, a contradiction in the ' +
      'person\'s life. Then let the rest of the story explain how we got there.',
    pacingCharacter:
      'Biographical pacing is deliberate. Early life sections move briskly; moments of ' +
      'major change and consequence earn longer dwell time. The emotional high points ' +
      'should feel earned by what came before them.',
    brollPhilosophy:
      'Archive material, reconstructions, and locations carry heavy meaning. ' +
      'B-roll should feel like memory — textured, specific, sometimes imperfect.',
    humanPerspectiveGuidance:
      'The subject is always the lens. Every scene should in some way reflect how this ' +
      'event was experienced by the central person — not just what happened historically.',
    mgPhilosophy:
      'Timelines and photo montages are native to biography. Use them to add context ' +
      'and locate events in time, but don\'t let them replace footage of the person or period.',
  },

  listicle: {
    name: 'listicle',
    editorialBrief:
      'A listicle operates on momentum and payoff. Each item on the list is a mini-story ' +
      'that must land before the next begins. The viewer is racing through — reward that ' +
      'with clear structure, fast pacing, and a visual style that signals "this is the next thing."',
    hookGuidance:
      'State the list immediately — what are they getting, and why should they care? ' +
      'The hook is a menu, not a mystery.',
    pacingCharacter:
      'Consistently fast. Each entry gets in and out efficiently. ' +
      'Variation in shot style between entries prevents monotony.',
    brollPhilosophy:
      'B-roll illustrates each entry specifically and quickly. ' +
      'It doesn\'t need depth — it needs to be instantly recognizable as the right image for this point.',
    humanPerspectiveGuidance:
      'Human examples add warmth and relatability to list entries that might otherwise ' +
      'feel abstract. Brief but specific.',
    mgPhilosophy:
      'Title cards, numbered treatments, bold text overlays — motion graphics signal ' +
      'structure and keep the viewer oriented within the list. Use them generously.',
  },

};

/**
 * Look up a format profile by genre string.
 * Falls back to 'documentary' if the genre is unrecognised.
 */
export function getFormatProfile(genre?: string | null): FormatProfile | undefined {
  if (!genre) return undefined;
  return FORMAT_PROFILES[genre.toLowerCase().replace(/[^a-z_]/g, '')] ?? undefined;
}
