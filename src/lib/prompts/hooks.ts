export function buildHooksPrompt({
  idea,
  locale,
}: {
  idea: string;
  locale: string;
}) {
  const language =
    locale === "fr" ? "French (Canada)" : "English";

  return `
You are a senior short-form copywriter.

Language: ${language}

Task:
Generate 10 high-performing hooks for short-form videos (TikTok / Reels / Shorts).

Rules:
- Hooks must be concise (1 sentence max)
- Strong curiosity or pain-based
- No emojis
- No hashtags
- No explanations

Context:
${idea}

Output format:
JSON array of strings.
`;
}
