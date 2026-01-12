export type CopyFormatKey =
  | "RAW"
  | "VEO_3_1"
  | "RUNWAY_GEN3"
  | "PIKA"
  | "HEYGEN"
  | "CAPCUT"
  | "JSON_MIN";

function pickFirstMatch(text: string, re: RegExp) {
  const m = text.match(re);
  return m?.[1]?.trim() || "";
}

function splitSections(prompt: string) {
  const s = (prompt || "").trim();

  // These prompts are single paragraph "Scene: ... Camera: ... On-screen text: ...".
  // We'll extract safely using regex; fallback to original prompt if missing.
  const scene = pickFirstMatch(s, /Scene:\s*([^]+?)(?=\sCamera:|$)/i);
  const camera = pickFirstMatch(s, /Camera:\s*([^]+?)(?=\sOn-screen text:|$)/i);
  const onScreen = pickFirstMatch(s, /On-screen text:\s*([^]+?)(?=\sVoice-over:|$)/i);
  const voice = pickFirstMatch(s, /Voice-over:\s*([^]+?)(?=\sSound design:|$)/i);
  const sound = pickFirstMatch(s, /Sound design:\s*([^]+?)(?=\sNegative prompt:|$)/i);
  const negative = pickFirstMatch(s, /Negative prompt:\s*([^]+?)(?=\sSettings:|$)/i);
  const settings = pickFirstMatch(s, /Settings:\s*([^]+)$/i);

  // Try pull duration + format from Settings
  const format = pickFirstMatch(settings, /(Format:\s*[^,.\n]+)/i) || "Format: 9:16";
  const duration =
    pickFirstMatch(settings, /(Duration:\s*[^,.\n]+)/i) ||
    pickFirstMatch(s, /(Duration:\s*\d+\s*seconds?)/i) ||
    "Duration: 6–8 seconds";

  return {
    scene: scene || "",
    camera: camera || "",
    onScreen: onScreen || "",
    voice: voice || "",
    sound: sound || "",
    negative: negative || "",
    settings: settings || "",
    format,
    duration,
  };
}

export function formatForTool(
  basePrompt: string,
  format: CopyFormatKey,
  meta?: { sceneNumber?: number; title?: string; toolVariant?: string }
) {
  const p = (basePrompt || "").trim();
  const { scene, camera, onScreen, voice, sound, negative, format: fmt, duration } = splitSections(p);

  const titleLine =
    meta?.sceneNumber
      ? `Scene ${meta.sceneNumber}${meta?.title ? ` — ${meta.title}` : ""}`
      : meta?.title
        ? meta.title
        : "";

  // RAW: exactly what is shown
  if (format === "RAW") return p;

  if (format === "VEO_3_1") {
    // Veo likes explicit: scene + camera + VO + SFX + negative + settings
    return [
      titleLine ? `# ${titleLine}` : "",
      "TOOL: Veo 3.1",
      "ASPECT: 9:16",
      duration.replace(/^Duration:\s*/i, "DURATION: "),
      "",
      `SCENE: ${scene || "(keep original scene description)"}`,
      `CAMERA: ${camera || "(keep original camera direction)"}`,
      `ON-SCREEN TEXT: ${onScreen || "(optional)"}`,
      `VOICE-OVER (EN): ${voice || "(optional)"}`,
      `SOUND DESIGN: ${sound || "(optional)"}`,
      `NEGATIVE: ${negative || "(none)"}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (format === "RUNWAY_GEN3") {
    // Runway Gen-3: concise motion/shot + avoid artifacts
    return [
      titleLine ? `# ${titleLine}` : "",
      "TOOL: Runway Gen-3",
      "FORMAT: 9:16",
      duration,
      "",
      `PROMPT: ${scene || "(scene)"}. ${camera ? `Camera: ${camera}.` : ""} ${
        onScreen ? `On-screen text: ${onScreen}.` : ""
      }`,
      `AUDIO: ${sound || "Keep clean, minimal background."}`,
      `VO: ${voice || "None"}`,
      `NEGATIVE PROMPT: ${negative || "low quality, artifacts, distorted faces, extra fingers, text glitches"}`,
      "NOTES: Smooth motion, avoid jitter, avoid warping, keep face natural if present.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (format === "PIKA") {
    // Pika: prompt + negative + aspect/duration
    return [
      titleLine ? `# ${titleLine}` : "",
      "TOOL: Pika",
      "ASPECT: 9:16",
      duration,
      "",
      `PROMPT: ${scene || "(scene)"} ${camera ? `| Camera: ${camera}` : ""}`,
      onScreen ? `TEXT (optional): ${onScreen}` : "",
      voice ? `VO (EN): ${voice}` : "",
      sound ? `SFX/MUSIC: ${sound}` : "",
      `NEGATIVE: ${negative || "blurry, low quality, warped faces, extra fingers, unreadable text"}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (format === "HEYGEN") {
    // HeyGen: script/VO + on-screen text; visuals as b-roll notes
    return [
      titleLine ? `# ${titleLine}` : "",
      "TOOL: HeyGen",
      "",
      `AVATAR / VISUAL NOTES: ${scene || "(scene notes)"} ${camera ? `| Camera: ${camera}` : ""}`,
      "",
      `ON-SCREEN TEXT: ${onScreen || "(none)"}`,
      "",
      `VOICE-OVER (EN): ${voice || "(none)"}`,
      "",
      `SOUND / MUSIC: ${sound || "(optional)"}`,
      "",
      `SAFE NOTES: Keep it clean, avoid logos/watermarks.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (format === "CAPCUT") {
    // CapCut: edit directions + overlays
    return [
      titleLine ? `# ${titleLine}` : "",
      "TOOL: CapCut (Edit Plan)",
      "",
      `SHOT: ${scene || "(shot description)"}`,
      camera ? `CAMERA: ${camera}` : "",
      onScreen ? `TEXT OVERLAY: ${onScreen}` : "",
      voice ? `VOICEOVER (EN): ${voice}` : "",
      sound ? `SOUND: ${sound}` : "",
      `EXPORT: 9:16 | ${duration.replace(/^Duration:\s*/i, "Duration ")}`,
      negative ? `AVOID: ${negative}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (format === "JSON_MIN") {
    // Minimal JSON for automations
    const obj = {
      sceneNumber: meta?.sceneNumber ?? null,
      title: meta?.title ?? null,
      toolVariant: meta?.toolVariant ?? null,
      format: "9:16",
      duration: duration.replace(/^Duration:\s*/i, ""),
      scene: scene || null,
      camera: camera || null,
      onScreenText: onScreen || null,
      voiceOver: voice || null,
      soundDesign: sound || null,
      negativePrompt: negative || null,
    };
    return JSON.stringify(obj, null, 2);
  }

  // fallback
  return [titleLine ? `# ${titleLine}` : "", p].filter(Boolean).join("\n\n");
}
