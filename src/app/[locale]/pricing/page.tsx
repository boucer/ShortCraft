"use client";

import Link from "next/link";
import {useLocale, useTranslations} from "next-intl";

export default function PricingPage() {
  const locale = useLocale();
  const t = useTranslations("pricing");

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-10">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-black/5"
        >
          ← {t("back")}
        </Link>

        <h1 className="mt-8 text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-base text-black/70">{t("subtitle")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 p-6">
          <div className="text-sm font-semibold uppercase tracking-wide text-black/50">
            {t("free.title")}
          </div>
          <div className="mt-3 text-3xl font-semibold">$0</div>
          <p className="mt-3 text-black/70">{t("free.desc")}</p>

          <div className="mt-6 rounded-xl bg-black/5 p-4 text-sm text-black/70">
            • Hooks → Storyboard → Prompts
            <br />• Quelques générations
            <br />• Essai rapide du workflow
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 p-6">
          <div className="text-sm font-semibold uppercase tracking-wide text-black/50">
            {t("pro.title")}
          </div>
          <div className="mt-3 text-3xl font-semibold">$19</div>
          <p className="mt-3 text-black/70">{t("pro.desc")}</p>

          <div className="mt-6 rounded-xl bg-black/5 p-4 text-sm text-black/70">
            • Générations illimitées
            <br />• Projets sauvegardés
            <br />• Exports “team-ready”
          </div>

          <button
            type="button"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-black/10 bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
            onClick={() => alert("Stripe plus tard 😉")}
          >
            Upgrade
          </button>
        </div>
      </div>
    </main>
  );
}
