"use client";

import { useEffect, useMemo, useState } from "react";

type Lang = "fr" | "en";

type Props = {
  hooksFr: string[] | null;
  hooksEn: string[] | null;
  defaultLang: Lang; // langue de contenu du projet (pas le locale UI)
  selectedHookFr: string | null;
  selectedHookEn: string | null;
  projectId: string;
  uiLocale: string; // "fr" ou "en" pour l'UI
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeHooksFromApi(data: any): string[] | null {
  if (!data) return null;

  // formats possibles:
  // { hooks: [...] }
  // { content: [...] }
  // { output: { content: [...] } }
  // { data: { content: [...] } }
  const candidate =
    data.hooks ??
    data.content ??
    data.output?.content ??
    data.data?.content ??
    data.projectOutput?.content ??
    null;

  return Array.isArray(candidate) ? (candidate as string[]) : null;
}

export default function HooksSectionClient({
  hooksFr,
  hooksEn,
  defaultLang,
  selectedHookFr,
  selectedHookEn,
  projectId,
  uiLocale,
}: Props) {
  // Langue affichée dans le panneau Hooks (contenu)
  const [lang, setLang] = useState<Lang>(defaultLang);

  // Hooks chargés depuis props + possibles updates après translate
  const [hooksByLang, setHooksByLang] = useState<{ fr: string[] | null; en: string[] | null }>({
    fr: hooksFr ?? null,
    en: hooksEn ?? null,
  });

  // Selection par langue (persistée côté serveur si endpoint présent)
  const [selectedByLang, setSelectedByLang] = useState<{ fr: string | null; en: string | null }>({
    fr: selectedHookFr ?? null,
    en: selectedHookEn ?? null,
  });

  const [isTranslating, setIsTranslating] = useState(false);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    // keep in sync if page refreshes with new props
    setHooksByLang({ fr: hooksFr ?? null, en: hooksEn ?? null });
  }, [hooksFr, hooksEn]);

  useEffect(() => {
    setSelectedByLang({ fr: selectedHookFr ?? null, en: selectedHookEn ?? null });
  }, [selectedHookFr, selectedHookEn]);

  const hooks = hooksByLang[lang];

  const otherLang: Lang = lang === "fr" ? "en" : "fr";

  const title = uiLocale === "fr" ? "Hooks" : "Hooks";
  const subtitle =
    uiLocale === "fr"
      ? "Choisis un hook. Tu peux traduire FR ⇄ EN sans perdre l’original."
      : "Pick a hook. You can translate FR ⇄ EN without losing the original.";

  const btnShowFr = uiLocale === "fr" ? "FR" : "FR";
  const btnShowEn = uiLocale === "fr" ? "EN" : "EN";
  const btnTranslate =
    uiLocale === "fr"
      ? `Traduire vers ${otherLang.toUpperCase()}`
      : `Translate to ${otherLang.toUpperCase()}`;

  const selectedLabel = uiLocale === "fr" ? "Sélectionné" : "Selected";
  const pickLabel = uiLocale === "fr" ? "Choisir ce hook" : "Select this hook";

  const hasHooks = useMemo(() => Array.isArray(hooks) && hooks.length > 0, [hooks]);

  function toast(type: "ok" | "err", msg: string) {
    setFlash({ type, msg });
    window.setTimeout(() => setFlash(null), 2200);
  }

  async function handleTranslate() {
    // On traduit vers "otherLang" et on met à jour hooksByLang[otherLang]
    setIsTranslating(true);
    try {
      const res = await fetch("/api/generate/hooks/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // on envoie juste le projet + from/to
        body: JSON.stringify({
          projectId,
          from: lang,
          to: otherLang,
        }),
      });

      if (!res.ok) {
        // endpoint peut ne pas exister encore -> message clean
        const txt = await res.text().catch(() => "");
        console.warn("Translate hooks failed:", res.status, txt);
        toast(
          "err",
          uiLocale === "fr"
            ? "Traduction indisponible (endpoint manquant)."
            : "Translation unavailable (missing endpoint)."
        );
        return;
      }

      const data = await res.json().catch(() => null);
      const translated = normalizeHooksFromApi(data);

      if (!translated || translated.length === 0) {
        toast(
          "err",
          uiLocale === "fr" ? "Aucun hook traduit reçu." : "No translated hooks returned."
        );
        return;
      }

      setHooksByLang((prev) => ({ ...prev, [otherLang]: translated }));
      // switch automatiquement sur la langue cible (UX clean)
      setLang(otherLang);

      toast("ok", uiLocale === "fr" ? "Traduction OK." : "Translated.");
    } finally {
      setIsTranslating(false);
    }
  }

  async function persistSelectedHook(nextHook: string, forLang: Lang) {
    // On tente de persister. Si ton endpoint n’existe pas encore,
    // la sélection reste au moins localement (pas de crash).
    try {
      const res = await fetch("/api/generate/hooks/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          locale: forLang, // on sauvegarde selected_hook sous "fr" ou "en"
          hook: nextHook,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn("Select hook persist failed:", res.status, txt);
        // pas d'erreur bloquante
      }
    } catch (e) {
      console.warn("Select hook persist error:", e);
    }
  }

  async function handleSelectHook(h: string) {
    setSelectedByLang((prev) => ({ ...prev, [lang]: h }));
    toast("ok", uiLocale === "fr" ? "Hook sélectionné." : "Hook selected.");
    await persistSelectedHook(h, lang);
  }

  return (
    <section className="mt-6 rounded-2xl border p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border p-1">
            <button
              type="button"
              onClick={() => setLang("fr")}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm",
                lang === "fr" ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-50"
              )}
            >
              {btnShowFr}
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm",
                lang === "en" ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-50"
              )}
            >
              {btnShowEn}
            </button>
          </div>

          <button
            type="button"
            onClick={handleTranslate}
            disabled={isTranslating}
            className={cx(
              "rounded-xl border px-4 py-2 text-sm",
              isTranslating ? "opacity-60" : "hover:bg-neutral-50"
            )}
            title={
              uiLocale === "fr"
                ? "Traduire les hooks vers l’autre langue"
                : "Translate hooks to the other language"
            }
          >
            {isTranslating ? (uiLocale === "fr" ? "Traduction..." : "Translating...") : btnTranslate}
          </button>
        </div>
      </div>

      {flash ? (
        <div
          className={cx(
            "mt-4 rounded-xl border px-4 py-3 text-sm",
            flash.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
          )}
        >
          {flash.msg}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {!hasHooks ? (
          <div className="rounded-xl border p-4 text-sm text-neutral-600">
            {uiLocale === "fr"
              ? "Aucun hook disponible pour cette langue. Génère des hooks, ou utilise Traduire."
              : "No hooks available for this language. Generate hooks, or use Translate."}
          </div>
        ) : (
          hooks!.map((h, idx) => {
            const isSelected = selectedByLang[lang] === h;
            return (
              <div key={`${lang}-${idx}`} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="whitespace-pre-wrap text-sm text-neutral-900">{h}</p>

                  <div className="shrink-0">
                    {isSelected ? (
                      <span className="inline-flex items-center rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
                        {selectedLabel}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectHook(h)}
                        className="rounded-xl border px-3 py-2 text-xs hover:bg-neutral-50"
                      >
                        {pickLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 text-xs text-neutral-500">
        {uiLocale === "fr" ? (
          <>
            Langue du projet : <span className="font-medium">{defaultLang.toUpperCase()}</span> •
            Sélection FR :{" "}
            <span className="font-medium">{selectedByLang.fr ? "Oui" : "Non"}</span> • Sélection EN :{" "}
            <span className="font-medium">{selectedByLang.en ? "Oui" : "Non"}</span>
          </>
        ) : (
          <>
            Project language: <span className="font-medium">{defaultLang.toUpperCase()}</span> •
            Selected FR: <span className="font-medium">{selectedByLang.fr ? "Yes" : "No"}</span> •
            Selected EN: <span className="font-medium">{selectedByLang.en ? "Yes" : "No"}</span>
          </>
        )}
      </div>
    </section>
  );
}
