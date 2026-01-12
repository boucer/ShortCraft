// middleware.ts (racine)
import createMiddleware from "next-intl/middleware";
import {routing} from "./src/i18n/routing";
import {NextRequest} from "next/server";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  console.log(
    "🟢 MIDDLEWARE HIT:",
    request.nextUrl.pathname
  );

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"]
};
