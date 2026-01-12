import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

import {
  buildImagePromptsV11System,
  buildImagePromptsV11User,
  inferStyleFromNiche,
} from "@/lib/prompts/image-prompts";

type StoryboardScene = {
  scene: number;
  visual: string;
  onScreenText?: string;
  voiceover?: string;
};

function getScenesFromStoryboardContent(content: any): StoryboardScene[] | null {
  // content is JSON stored in ProjectOutput.content
  // Expected shapes:
  // A) { scenes: [...] }
  // B) [...] (array directly)
  const c = content ?? null;

  if (Array.isArray(c)) return c as StoryboardScene[];
  if (c && Array.isArray(c.scenes)) return c.scenes as StoryboardScene[];

  return null;
}

function stripFences(raw: string) {
  return (raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export async function POST(req: Request) {
  const session = await auth();

  // Dev bypass: allow local testing without login
  const isDev = process.env.NODE_ENV !== "production";
  if (!session?.user && !isDev) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { projectId, locale } = body || {};

  if (!projectId || !locale) {
    return NextResponse.json(
      { error: "Missing projectId or locale." },
      { status: 400 }
    );
  }

  // 1) Load storyboard from ProjectOutput
  const storyboardOut = await prisma.projectOutput.findFirst({
    where: {
      projectId,
      locale,
      kind: "storyboard",
    },
    select: {
      id: true,
      content: true,
    },
  });

  if (!storyboardOut) {
    return NextResponse.json(
      { error: "Storyboard not found. Generate storyboard first." },
      { status: 400 }
    );
  }

  const scenes = getScenesFromStoryboardContent(storyboardOut.content);

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    return NextResponse.json(
      { error: "Storyboard content has no scenes[]. Regenerate storyboard." },
      { status: 400 }
    );
  }

  // (Optional) Load project to infer style/niche better
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true, idea: true },
  });

  const nicheHint = `${project?.title ?? ""} ${project?.idea ?? ""}`.trim();
  const style = inferStyleFromNiche(nicheHint || "SaaS");

  // 2) Build prompt messages
  const system = buildImagePromptsV11System();
  const user = buildImagePromptsV11User(scenes, {
    niche: nicheHint || "SaaS",
    styleOverride: style,
  });

  // 3) Call OpenAI
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || "[]";
  const unfenced = stripFences(raw);

  let prompts: any[] = [];
  try {
    const parsed = JSON.parse(unfenced);
    if (!Array.isArray(parsed)) throw new Error("Not an array");
    prompts = parsed;
  } catch {
    return NextResponse.json(
      { error: "Failed to parse image prompts JSON from model." },
      { status: 500 }
    );
  }

  // 4) Save to ProjectOutput (upsert by projectId+locale+kind)
  const existing = await prisma.projectOutput.findFirst({
    where: { projectId, locale, kind: "image_prompts" },
    select: { id: true, version: true },
  });

  if (existing) {
    await prisma.projectOutput.update({
      where: { id: existing.id },
      data: {
        content: {
          style,
          count: prompts.length,
          prompts,
        },
        version: 11, // V1.1
      },
    });
  } else {
    await prisma.projectOutput.create({
      data: {
        projectId,
        locale,
        kind: "image_prompts",
        version: 11, // V1.1
        content: {
          style,
          count: prompts.length,
          prompts,
        },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    style,
    count: prompts.length,
  });
}
