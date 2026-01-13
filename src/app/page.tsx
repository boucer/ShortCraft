import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/en"); // ou "/fr" si tu veux FR par défaut
}
