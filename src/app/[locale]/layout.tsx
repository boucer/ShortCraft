// src/app/[locale]/layout.tsx
import {NextIntlClientProvider} from "next-intl";
import {notFound} from "next/navigation";
import {routing, type Locale} from "@/i18n/routing";
import {setRequestLocale, getMessages} from "next-intl/server";

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale: localeParam} = await params;

  if (!routing.locales.includes(localeParam as Locale)) {
    notFound();
  }

  const locale = localeParam as Locale;

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}
