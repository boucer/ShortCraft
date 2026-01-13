import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  const email = session?.user?.email;
  if (!email) redirect(`/${locale}/login?callbackUrl=/${locale}/app/projects/new`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) redirect(`/${locale}/login?callbackUrl=/${locale}/app/projects/new`);

  // ✅ IMPORTANT: on fige l'id non-null pour l'utiliser partout (y compris dans la server action)
  const currentUserId = user.id;

  const clients = await prisma.client.findMany({
    where: { userId: currentUserId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  async function createProject(formData: FormData) {
    "use server";

    const title = String(formData.get("title") ?? "").trim();
    const idea = String(formData.get("idea") ?? "").trim();
    const clientIdRaw = String(formData.get("clientId") ?? "").trim();
    const clientId = clientIdRaw.length ? clientIdRaw : null;

    if (!title || !idea) {
      redirect(`/${locale}/app/projects/new`);
    }

    const project = await prisma.project.create({
      data: {
        userId: currentUserId, // ✅ FIX: plus de user.id ici
        clientId,
        title,
        idea,
        status: "DRAFT",
      },
      select: { id: true },
    });

    redirect(`/${locale}/app/projects/${project.id}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">New project</h1>
        <p className="mt-2 text-neutral-600">
          Create a project from one idea. We’ll generate hooks → storyboard →
          prompts → script.
        </p>
      </div>

      <form action={createProject} className="mt-8 space-y-5">
        <div className="rounded-2xl border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium">Title</label>
            <input
              name="title"
              placeholder="Ex: Cold outreach for dentists"
              className="mt-2 w-full rounded-xl border px-4 py-3"
              required
              maxLength={120}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Idea</label>
            <textarea
              name="idea"
              placeholder="Write the idea + context (audience, offer, tone, constraints)…"
              className="mt-2 w-full rounded-xl border px-4 py-3 min-h-[140px]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Client (optional)</label>
            <select
              name="clientId"
              className="mt-2 w-full rounded-xl border px-4 py-3"
              defaultValue=""
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs text-neutral-500">
              You can manage clients in /app/clients later.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <a className="rounded-xl border px-4 py-2" href={`/${locale}/app/projects`}>
            Cancel
          </a>

          <button type="submit" className="rounded-xl border px-4 py-2">
            Create project
          </button>
        </div>
      </form>
    </main>
  );
}
