import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.projectId || "").trim();
  const locale = String(body?.locale || "").trim() || "en";
  const hook = String(body?.hook || "").trim();
  const language = String(body?.language || "").trim() === "fr" ? "fr" : "en";

  if (!projectId || !hook) {
    return NextResponse.json({ error: "Missing projectId/hook" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const last = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, kind: "selected_hook", locale: language },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (last?.version ?? 0) + 1;

  await prisma.projectOutput.create({
    data: {
      projectId: project.id,
      // IMPORTANT: store selection under the language of the hook
      locale: language,
      kind: "selected_hook",
      version: nextVersion,
      content: {
        hook,
        language,
        selectedAt: new Date().toISOString(),
      },
    } as any,
  });

  return NextResponse.json({ ok: true, version: nextVersion });
}
