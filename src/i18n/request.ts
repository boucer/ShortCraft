// src/i18n/request.ts
import {getRequestConfig} from "next-intl/server";
import {routing} from "./routing";

export default getRequestConfig(async ({requestLocale}) => {
  // ✅ vient du middleware + segment /[locale]
  let locale = await requestLocale;

  // ✅ safety
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
