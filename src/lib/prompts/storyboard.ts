type BuildStoryboardPromptArgs = {
  idea: string;
  hooks: string[];
  locale: string; // "fr" | "en" (ou autre)
};

export function buildStoryboardPrompt({ idea, hooks, locale }: BuildStoryboardPromptArgs) {
  const isFr = (locale || "").toLowerCase().startsWith("fr");

  const langRules = isFr
    ? `- Écris en FRANÇAIS (Québec si possible).
- Style: direct, punchy, viral, simple à comprendre.`
    : `- Write in ENGLISH.
- Style: direct, punchy, viral, easy to follow.`;

  // On garde un seul hook "principal" pour guider le storyboard (plus stable)
  const primaryHook = hooks?.[0] ?? "";

  return `
You are an expert short-form video writer.

Goal: create a SHORT storyboard from an idea + a primary hook.
The storyboard will be used to generate the rest of the pipeline later.

${langRules}

INPUT:
- Idea: """${idea}"""
- Primary hook: """${primaryHook}"""

OUTPUT FORMAT (IMPORTANT):
Return ONLY valid JSON, with no extra text.
Return a JSON array of 6 to 8 objects.
Each object MUST have exactly these keys:
- scene (number starting at 1)
- onScreenText (string, short, max ~12 words)
- voiceover (string, 1-2 sentences)
- visual (string, describe what we see)

Rules:
- Scene 1 must be the hook.
- Keep it fast-paced, high retention.
- No emojis in voiceover.
- No markdown. JSON only.

Example (shape only):
[
  { "scene": 1, "onScreenText": "...", "voiceover": "...", "visual": "..." }
]
`.trim();
}
