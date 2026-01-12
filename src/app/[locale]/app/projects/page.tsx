import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function AppProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  const email = session?.user?.email;
  if (!email) redirect(`/${locale}/login?callbackUrl=/${locale}/app/projects`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) redirect(`/${locale}/login?callbackUrl=/${locale}/app/projects`);

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      client: { select: { name: true } },
    },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="mt-2 text-neutral-600">
            Logged in as {user.email ?? email}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            className="rounded-xl border px-4 py-2"
            href={`/${locale}/app/generate`}
          >
            Generate
          </Link>
          <Link
            className="rounded-xl border px-4 py-2"
            href={`/${locale}/app/settings`}
          >
            Settings
          </Link>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>

        <Link
          className="rounded-xl border px-4 py-2"
          href={`/${locale}/app/projects/new`}
        >
          + New project
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        {projects.length === 0 ? (
          <div className="rounded-2xl border p-6">
            <p className="text-neutral-700 font-medium">No projects yet.</p>
            <p className="mt-1 text-sm text-neutral-600">
              Create your first project to generate hooks, storyboard, prompts,
              and a ready-to-record script.
            </p>
            <div className="mt-4">
              <Link
                className="rounded-xl border px-4 py-2 inline-block"
                href={`/${locale}/app/projects/new`}
              >
                Create a project
              </Link>
            </div>
          </div>
        ) : (
          projects.map((p) => (
            <Link
              key={p.id}
              href={`/${locale}/app/projects/${p.id}`}
              className="block rounded-2xl border p-5 hover:bg-neutral-50 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{p.title}</div>
                  <div className="mt-1 text-sm text-neutral-600">
                    {p.client?.name ? `Client: ${p.client.name} • ` : ""}
                    Status: {p.status}
                  </div>
                </div>
                <div className="text-xs text-neutral-500">
                  {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
