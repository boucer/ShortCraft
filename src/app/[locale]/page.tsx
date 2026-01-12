// src/app/[locale]/page.tsx
import {notFound} from "next/navigation";
import {routing, type Locale} from "@/i18n/routing";
import Link from "next/link";

type Messages = typeof import("../../messages/en.json");

export default async function Home({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale: localeParam} = await params;

  if (!routing.locales.includes(localeParam as Locale)) notFound();

  const locale = localeParam as Locale;

  const messages: Messages =
    (await import(`../../messages/${locale}.json`)).default;

  const t = (key: string) =>
    key.split(".").reduce<any>((acc, part) => acc?.[part], messages) ?? key;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h1 className="text-4xl font-semibold">{t("home.title")}</h1>
      <p className="mt-3 text-lg text-neutral-600">{t("home.tagline")}</p>
    </div>

    <nav className="flex gap-3">
      <Link
        className="inline-flex w-44 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium"
        href={`/${locale}/pricing`}
      >
        {t("nav.pricing")}
      </Link>

      <Link
        className="inline-flex w-44 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium"
        href={`/${locale}/login`}
      >
        {t("nav.login")}
      </Link>

      <Link
        className="inline-flex w-44 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium"
        href={`/${locale}/app/projects`}
      >
        Ouvrir l’app
      </Link>
    </nav>
  </div>

  <div className="mt-10 grid gap-4">
    <div className="rounded-2xl border p-6">
      <h2 className="text-xl font-semibold">{t("home.v1Title")}</h2>
      <p className="mt-2 text-neutral-600">{t("home.v1Line1")}</p>
      <p className="mt-2 text-neutral-600">{t("home.v1Line2")}</p>
    </div>
  </div>
</main>
  );
}
