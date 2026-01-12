// src/app/app/projects/page.tsx
import {auth} from "@/auth";
import Link from "next/link";

export default async function ProjectsPage() {
  const session = await auth();

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Projects</h1>
      <p className="mt-2 text-neutral-600">
        Session: {session?.user?.email ?? "not logged in"}
      </p>

      <div className="mt-8 flex gap-3">
        <Link className="rounded-xl border px-4 py-2" href="/app/generate">
          Go generate
        </Link>
        <Link className="rounded-xl border px-4 py-2" href="/app/settings">
          Settings
        </Link>
      </div>
    </main>
  );
}
