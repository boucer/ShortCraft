// src/app/[locale]/app/layout.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // ✅ NextAuth v5
  const session = await auth();

  // ✅ Si pas connecté → redirect vers /[locale]/login (sinon /login = 404)
  if (!session?.user) {
    const callbackUrl = encodeURIComponent(`/${locale}/app/projects`);
    redirect(`/${locale}/login?callbackUrl=${callbackUrl}`);
  }

  return <>{children}</>;
}
