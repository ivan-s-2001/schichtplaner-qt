"use client";

import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";

interface EmailAccessGateProps {
  token: string | null;
  email: string | null;
}

type AccessState = "checking" | "blocked";

export function EmailAccessGate({ token, email }: EmailAccessGateProps) {
  const router = useRouter();
  const [state, setState] = useState<AccessState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function authorize() {
      await signOut({ redirect: false });

      if (!token && !email) {
        if (!cancelled) setState("blocked");
        return;
      }

      const result = await signIn("credentials", {
        token: token ?? undefined,
        email: email ?? undefined,
        redirect: false,
      });

      if (cancelled) return;

      if (!result || result.error) {
        setState("blocked");
        return;
      }

      router.replace("/schedule/employee");
      router.refresh();
    }

    authorize().catch(() => {
      if (!cancelled) setState("blocked");
    });

    return () => {
      cancelled = true;
    };
  }, [email, router, token]);

  if (state === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="flex items-center gap-3 rounded-lg border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="size-5 animate-spin" />
          Синхронизация с Outline…
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <LockKeyhole className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">Доступ заблокирован</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Откройте расписание из Outline. Ссылка входа одноразовая и действует 60 секунд.
        </p>
      </section>
    </main>
  );
}
