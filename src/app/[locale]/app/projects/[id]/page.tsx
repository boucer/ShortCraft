import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import ImagePromptsSection from "@/components/ImagePromptsSection";
import VideoPromptsPanel from "@/components/video/VideoPromptsPanel";
import EditingScriptSection from "@/components/editing/EditingScriptSection";
import HooksSectionClient from "@/components/hooks/HooksSectionClient";

const STEPS = [
  { kind: "hooks", label: "Hooks" },
  { kind: "storyboard", label: "Storyboard" },
  { kind: "image_prompts", label: "Image prompts" },
  { kind: "video_prompts", label: "Video prompts" },
  { kind: "editing_script", label: "Editing script" },
  { kind: "script", label: "Final script" },
] as const;

type StoryboardScene = {
  scene: number;
  onScreenText: string;
  voiceover: string;
  visual: string;
};

type ImagePromptItem = {
  scene: number;
  character?: string;
  intent?: string;
  style?: string;
  imagePrompt: string;
};

type VideoPromptItem = {
  sceneNumber: number;
  title?: string;
  fullPrompt: string;
};

function getStoryboardScenesFromContent(content: any): StoryboardScene[] | null {
  if (Array.isArray(content)) return content as StoryboardScene[];
  if (content && Array.isArray(content.scenes))
    return content.scenes as StoryboardScene[];
  return null;
}

function getImagePromptsFromContent(content: any): {
  style: string;
  count: number;
  prompts: ImagePromptItem[];
} | null {
  if (!content) return null;
  const c = content as any;

  if (Array.isArray(c.prompts)) {
    return {
      style: c.style ?? "business",
      count: c.count ?? c.prompts.length,
      prompts: c.prompts as ImagePromptItem[],
    };
  }

  if (Array.isArray(c.scenes)) {
    return {
      style: c.style ?? "business",
      count: c.scenes.length,
      prompts: c.scenes as ImagePromptItem[],
    };
  }

  return null;
}

function getVideoPromptsFromContent(content: any): any[] | null {
  if (!content) return null;
  const c = content as any;

  if (Array.isArray(c)) return c;
  if (Array.isArray(c.prompts)) return c.prompts;
  if (Array.isArray(c.scenes)) return c.scenes;

  return null;
}

function promptObjectToString(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;

  if (typeof v === "object") {
    const parts: string[] = [];

    if (v.scene) parts.push(`Scene:\n${v.scene}`);
    if (v.camera) parts.push(`Camera:\n${v.camera}`);
    if (v.onScreenText) parts.push(`On-screen text:\n"${v.onScreenText}"`);
    if (v.voiceover) parts.push(`Voice-over:\n${v.voiceover}`);
    if (v.sound) parts.push(`Sound:\n${v.sound}`);
    if (v.negative) parts.push(`Negative:\n${v.negative}`);

    return parts.length ? parts.join("\n\n") : JSON.stringify(v, null, 2);
  }

  return String(v);
}

function normalizeFullPrompt(v: any): string {
  const s = promptObjectToString(v);
  return typeof s === "string" ? s : String(s);
}

/**
 * Locale-first output fetch:
 * 1) Try current locale (latest version)
 * 2) Fallback any locale (latest version)
 */
async function findLatestOutput(
  projectId: string,
  locale: string,
  kind: string,
  select: any
) {
  const local = await prisma.projectOutput.findFirst({
    where: { projectId, locale, kind },
    orderBy: { version: "desc" },
    select,
  });
  if (local) return local;

  return prisma.projectOutput.findFirst({
    where: { projectId, kind },
    orderBy: { version: "desc" },
    select,
  });
}

export default async function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const session = await auth();
  const email = session?.user?.email;
  if (!email)
    redirect(`/${locale}/login?callbackUrl=/${locale}/app/projects/${id}`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user)
    redirect(`/${locale}/login?callbackUrl=/${locale}/app/projects/${id}`);

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      idea: true,
      status: true,
      contentLanguage: true,
      client: { select: { name: true } },
    },
  });

  if (!project) notFound();

  // Outputs list for meta (locale-first, fallback any-locale)
  let outputs = await prisma.projectOutput.findMany({
    where: { projectId: project.id, locale },
    orderBy: { updatedAt: "desc" },
    select: { kind: true, version: true, updatedAt: true },
  });

  if (!outputs.length) {
    outputs = await prisma.projectOutput.findMany({
      where: { projectId: project.id },
      orderBy: { updatedAt: "desc" },
      select: { kind: true, version: true, updatedAt: true },
    });
  }

  // keep latest per kind
  const outputByKind = new Map<string, (typeof outputs)[number]>();
  for (const o of outputs) {
    if (!outputByKind.has(o.kind)) outputByKind.set(o.kind, o);
  }

  // ✅ Hooks FR/EN (latest per language)
  const hooksFrOutput = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, kind: "hooks", locale: "fr" },
    orderBy: { version: "desc" },
    select: { content: true },
  });

  const hooksEnOutput = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, kind: "hooks", locale: "en" },
    orderBy: { version: "desc" },
    select: { content: true },
  });

  const hooksFr =
    hooksFrOutput && Array.isArray((hooksFrOutput as any).content)
      ? ((hooksFrOutput as any).content as string[])
      : null;

  const hooksEn =
    hooksEnOutput && Array.isArray((hooksEnOutput as any).content)
      ? ((hooksEnOutput as any).content as string[])
      : null;

  // ✅ Selected hook FR/EN
  const selectedHookFrOutput = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, kind: "selected_hook", locale: "fr" },
    orderBy: { version: "desc" },
    select: { content: true },
  });

  const selectedHookEnOutput = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, kind: "selected_hook", locale: "en" },
    orderBy: { version: "desc" },
    select: { content: true },
  });

  const selectedHookFr =
    (selectedHookFrOutput as any)?.content?.hook &&
    typeof (selectedHookFrOutput as any).content.hook === "string"
      ? ((selectedHookFrOutput as any).content.hook as string)
      : null;

  const selectedHookEn =
    (selectedHookEnOutput as any)?.content?.hook &&
    typeof (selectedHookEnOutput as any).content.hook === "string"
      ? ((selectedHookEnOutput as any).content.hook as string)
      : null;

  const defaultLang = (project as any)?.contentLanguage === "fr" ? "fr" : "en";

  // Storyboard
  const storyboardOutput = await findLatestOutput(project.id, locale, "storyboard", {
    content: true,
    updatedAt: true,
    version: true,
  });

  const storyboard = storyboardOutput
    ? getStoryboardScenesFromContent((storyboardOutput as any).content)
    : null;

  // Image prompts
  const imagePromptsOutput = await findLatestOutput(project.id, locale, "image_prompts", {
    content: true,
    updatedAt: true,
    version: true,
  });

  const imagePrompts = imagePromptsOutput
    ? getImagePromptsFromContent((imagePromptsOutput as any).content)
    : null;

  const imagePromptsVersionLabel = (imagePromptsOutput as any)?.updatedAt
    ? `v${(imagePromptsOutput as any).version} • ${new Date(
        (imagePromptsOutput as any).updatedAt
      ).toLocaleString()}`
    : "";

  // Video prompts
  const videoPromptsOutput = await findLatestOutput(project.id, locale, "video_prompts", {
    content: true,
    updatedAt: true,
    version: true,
  });

  const videoPromptsRaw = videoPromptsOutput
    ? getVideoPromptsFromContent((videoPromptsOutput as any).content)
    : null;

  const videoPrompts: VideoPromptItem[] | null =
    videoPromptsRaw && videoPromptsRaw.length
      ? videoPromptsRaw
          .map((p: any) => ({
            sceneNumber: Number(p.sceneNumber ?? p.scene ?? 0),
            title: p.title,
            fullPrompt: normalizeFullPrompt(p.fullPrompt ?? p),
          }))
          .filter((p) => p.sceneNumber > 0)
          .sort((a, b) => a.sceneNumber - b.sceneNumber)
      : null;

  const videoPromptsVersionLabel = (videoPromptsOutput as any)?.updatedAt
    ? `v${(videoPromptsOutput as any).version} • ${new Date(
        (videoPromptsOutput as any).updatedAt
      ).toLocaleString()}`
    : "";

  // Editing script
  const editingScriptOutput = await findLatestOutput(project.id, locale, "editing_script", {
    content: true,
    updatedAt: true,
    version: true,
  });

  const editingScriptVersionLabel = (editingScriptOutput as any)?.updatedAt
    ? `v${(editingScriptOutput as any).version} • ${new Date(
        (editingScriptOutput as any).updatedAt
      ).toLocaleString()}`
    : "Not generated yet";

  const canGenerateEditing =
    !!(storyboard && storyboard.length) && !!(videoPromptsOutput as any)?.content;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-neutral-600 hover:underline"
            href={`/${locale}/app/projects`}
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">{project.title}</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {project.client?.name ? `Client: ${project.client.name} • ` : ""}
            Locale: {locale}
          </p>
        </div>

        <Link
          className="rounded-xl border px-4 py-2"
          href={`/${locale}/app/generate?projectId=${project.id}`}
        >
          Generate
        </Link>
      </div>

      <div className="mt-8 rounded-2xl border p-6">
        <h2 className="text-lg font-semibold">Idea</h2>
        <p className="mt-2 whitespace-pre-wrap text-neutral-700">
          {project.idea}
        </p>
      </div>

      {/* ✅ Hooks (toggle FR/EN + translate + choose hook per language) */}
      <HooksSectionClient
        hooksFr={hooksFr}
        hooksEn={hooksEn}
        defaultLang={defaultLang}
        selectedHookFr={selectedHookFr}
        selectedHookEn={selectedHookEn}
        projectId={project.id}
        uiLocale={locale}
      />

      {/* Storyboard */}
      {storyboard ? (
        <section className="mt-6 rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Storyboard</h2>
          <div className="mt-4 space-y-3">
            {storyboard.map((s) => (
              <div key={s.scene} className="rounded-xl border p-4">
                <div className="font-medium">Scene {s.scene}</div>
                <div className="mt-1 text-sm">
                  <strong>Visual:</strong> {s.visual}
                </div>
                <div className="mt-1 text-sm">
                  <strong>On-screen:</strong> {s.onScreenText}
                </div>
                <div className="mt-1 text-sm">
                  <strong>Voiceover:</strong> {s.voiceover}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Image prompts */}
      {imagePrompts ? (
        <ImagePromptsSection
          styleLabel={imagePrompts.style}
          versionLabel={imagePromptsVersionLabel}
          prompts={imagePrompts.prompts}
        />
      ) : null}

      {/* Video prompts */}
      {(videoPromptsOutput as any)?.content ? (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Video prompts</h2>
            <span className="text-xs text-neutral-500">
              {videoPromptsVersionLabel}
            </span>
          </div>
          <VideoPromptsPanel content={(videoPromptsOutput as any).content as any} />
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Video prompts</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Video prompts not generated yet.
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Generate image prompts first, then generate video prompts.
          </p>
        </section>
      )}

      {/* Editing script */}
      <EditingScriptSection
        projectId={project.id}
        locale={locale}
        initialContent={(editingScriptOutput as any)?.content ?? null}
        versionLabel={editingScriptVersionLabel}
        canGenerate={canGenerateEditing}
      />
    </main>
  );
}
