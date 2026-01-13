"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

export default function LoginClient() {
  const locale = useLocale();
  const t = useTranslations("login");
  const params = useSearchParams();

  const raw = params.get("callbackUrl");
  const callbackUrl = raw && raw.startsWith("/") ? raw : `/${locale}/app`;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Link
        href={`/${locale}`}
        className="inline-flex items-center rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-black/5"
      >
        ← Home
      </Link>

      <h1 className="mt-8 text-4xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-base text-black/70">{t("subtitle")}</p>

      <div className="mt-8 rounded-2xl border border-black/10 p-6">
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="inline-flex w-full items-center justify-center rounded-xl border border-black/10 bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          {t("google")}
        </button>

        <p className="mt-4 text-sm text-black/60">
          App localisée sur{" "}
          <code className="rounded bg-black/5 px-1 py-0.5">/{locale}/app/*</code>
        </p>
      </div>
    </main>
  );
}
