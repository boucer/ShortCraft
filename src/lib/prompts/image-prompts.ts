// src/lib/prompts/image-prompts.ts

export type StoryboardScene = {
  scene: number;
  onScreenText?: string;
  voiceover?: string;
  visual: string;
};

export type ImageStyle =
  | "default"
  | "business"
  | "creator"
  | "coaching"
  | "fitness"
  | "beauty"
  | "food"
  | "realestate"
  | "automotive";

export type ImagePromptV11 = {
  scene: number;
  character: string; // global/persistent block (same across scenes)
  intent: string; // short phrase
  style: ImageStyle;
  imagePrompt: string; // final assembled prompt
};

export type ImagePromptsV11Options = {
  // If you already know the niche/category from the project, pass it.
  niche?: string; // e.g. "SaaS", "Money", "Creator", "Fitness", etc.
  // If user wants a specific look
  styleOverride?: ImageStyle;
  // Optional: user provided character description to persist
  characterOverride?: string;
};

const STYLE_PROFILES: Record<ImageStyle, string> = {
  default:
    "cinematic lighting, ultra-realistic, shallow depth of field, professional photo look",
  business:
    "clean modern office, soft natural lighting, professional atmosphere, high-end startup aesthetic",
  creator:
    "natural daylight, handheld smartphone feel, authentic social media photo, slightly imperfect framing",
  coaching:
    "soft warm lighting, calm environment, minimal background, emotional and introspective mood",
  fitness:
    "high-contrast gym lighting, dynamic energy, sweat detail, athletic realism, premium fitness campaign look",
  beauty:
    "soft beauty lighting, clean studio background, high-end skincare editorial look, natural skin texture",
  food:
    "appetizing natural lighting, macro detail, steam and texture emphasis, premium food photography look",
  realestate:
    "bright airy interior, wide clean composition, architectural realism, premium listing photo look",
  automotive:
    "dramatic showroom lighting, glossy reflections, cinematic car commercial look, crisp detail",
};

const DEFAULT_CHARACTER = [
  "Main character:",
  "Relatable adult, realistic facial features, not a model, natural skin texture.",
  "Neutral clothing (t-shirt / casual blazer), modern look.",
].join("\n");

// simple heuristic mapping niche -> style
export function inferStyleFromNiche(niche?: string): ImageStyle {
  const n = (niche || "").toLowerCase();

  if (n.includes("saas") || n.includes("business") || n.includes("startup") || n.includes("money"))
    return "business";
  if (n.includes("creator") || n.includes("ugc") || n.includes("tiktok") || n.includes("reels"))
    return "creator";
  if (n.includes("coach") || n.includes("mindset") || n.includes("therapy") || n.includes("psych"))
    return "coaching";
  if (n.includes("fitness") || n.includes("gym") || n.includes("workout")) return "fitness";
  if (n.includes("beauty") || n.includes("skincare") || n.includes("makeup")) return "beauty";
  if (n.includes("food") || n.includes("recipe") || n.includes("cooking")) return "food";
  if (n.includes("real estate") || n.includes("realtor") || n.includes("mortgage")) return "realestate";
  if (n.includes("car") || n.includes("auto") || n.includes("dealership")) return "automotive";

  return "default";
}

export function buildImagePromptsV11System(): string {
  return [
    "You are ShortCraft's Image Prompt Generator.",
    "Your job: turn each storyboard scene into ONE high-quality image prompt for image generators.",
    "",
    "Hard rules:",
    "- Output MUST be valid JSON ONLY (no markdown, no prose).",
    "- Output MUST be a JSON array of objects.",
    "- One object per scene, in the same order as input.",
    "- Prompts MUST be in English.",
    "- Always include 'vertical 9:16'.",
    "- NEVER ask to render text in the image.",
    "- Always add a negative prompt line: No text, no subtitles, no watermark, no logo.",
    "",
    "V1.1 structure inside each prompt:",
    "1) Character consistency block (global/persistent across scenes)",
    "2) Scene intent (short emotional intent phrase)",
    "3) Style profile (based on chosen style)",
    "4) Technical + negative prompt",
    "",
    "Return fields per item:",
    `- scene (number)`,
    `- character (string, a multi-line block starting with 'Main character:')`,
    `- intent (string)`,
    `- style (one of: ${Object.keys(STYLE_PROFILES).join(", ")})`,
    `- imagePrompt (string)`,
  ].join("\n");
}

export function buildImagePromptsV11User(
  scenes: StoryboardScene[],
  opts: ImagePromptsV11Options = {}
): string {
  const style: ImageStyle =
    opts.styleOverride || inferStyleFromNiche(opts.niche);

  const styleProfile = STYLE_PROFILES[style] || STYLE_PROFILES.default;

  const character =
    (opts.characterOverride || "").trim() || DEFAULT_CHARACTER;

  // We feed the model: style + character + all scenes with their "visual"
  const sceneLines = scenes
    .map((s) => {
      return [
        `Scene ${s.scene}:`,
        `Visual: ${s.visual}`,
        s.onScreenText ? `On-screen text (DO NOT put text in image): ${s.onScreenText}` : "",
        s.voiceover ? `Voiceover context: ${s.voiceover}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    "Generate image prompts for the storyboard below.",
    "",
    "Global settings:",
    `- Chosen style: ${style}`,
    `- Style profile: ${styleProfile}`,
    "",
    "Character consistency block (must be identical across all items):",
    character,
    "",
    "Storyboard scenes:",
    sceneLines,
    "",
    "Prompt template (must be followed in 'imagePrompt'):",
    [
      "A vertical 9:16 cinematic photo.",
      "",
      "[CHARACTER BLOCK]",
      "",
      "Scene intent:",
      "[INTENT PHRASE + 1 short sentence describing emotion/action]",
      "",
      "Environment:",
      "[LOCATION / ENVIRONMENT]",
      "",
      "Style profile:",
      "[STYLE PROFILE]",
      "",
      "Camera:",
      "[SHOT TYPE + LENS]",
      "",
      "No text, no subtitles, no watermark, no logo, no distorted face, no extra fingers, no blur, no low quality",
    ].join("\n"),
  ].join("\n");
}

/**
 * Optional: If you ever want to generate the final prompt locally (without the model),
 * you can use this helper. In V1.1, we still let the model pick lens/shot and fine details.
 */
export function buildFinalPrompt({
  character,
  intent,
  environment,
  style,
  camera,
}: {
  character: string;
  intent: string;
  environment: string;
  style: ImageStyle;
  camera: string;
}): string {
  const styleProfile = STYLE_PROFILES[style] || STYLE_PROFILES.default;

  return [
    "A vertical 9:16 cinematic photo.",
    "",
    character.trim(),
    "",
    "Scene intent:",
    intent.trim(),
    "",
    "Environment:",
    environment.trim(),
    "",
    "Style profile:",
    styleProfile,
    "",
    "Camera:",
    camera.trim(),
    "",
    "No text, no subtitles, no watermark, no logo, no distorted face, no extra fingers, no blur, no low quality",
  ].join("\n");
}
