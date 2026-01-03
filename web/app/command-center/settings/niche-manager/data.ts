export const CUSTOM_NICHES = [
  {
    id: "1",
    title: "Folklore Horror",
    description: "Horror stories focusing on folklore type protagonists.",
    model: "anthropic/claude-sonnet-4.5",
    client: "openrouter",
    prompts: 24,
  },
  {
    id: "2",
    title: "BL Stories 1",
    description: "BL Stories focusing on romantic and dramatic narratives.",
    model: "anthropic/claude-sonnet-4.5",
    client: "openrouter",
    prompts: 10,
  },
  {
    id: "3",
    title: "Horror Ocean",
    description:
      "Horror stories focusing on things happening in or above the oceans.",
    model: "anthropic/claude-sonnet-4.5",
    client: "openrouter",
    prompts: 25,
  },
];

export const GLOBAL_NICHES = [
  {
    id: "g1",
    title: "Horror (strange rules)",
    description:
      "Horror stories featuring bizarre rules that characters must follow to survive.",
    model: "ft:gpt-4o-2024-08-06:personal:horror-ideas2:AJPp...",
    client: "openai",
    prompts: 36,
    isGlobal: true,
  },
  {
    id: "g2",
    title: "Horror",
    description:
      "Standard horror stories featuring supernatural elements and scary situations.",
    model: "ft:gpt-4o-2024-08-06:personal:horror-ideas2:AJPp...",
    client: "openai",
    prompts: 17,
    isGlobal: true,
  },
];

export const ALL_NICHES = [...CUSTOM_NICHES, ...GLOBAL_NICHES];
