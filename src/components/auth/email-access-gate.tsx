"use client";

import { useEffect, useState } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";

interface EmailAccessGateProps {
  token: string | null;
  email: string | null;
  mode: "schedule" | "vacations";
}

type AccessState = "checking" | "blocked";

function projectPath(mode: "schedule" | "vacations") {
  return mode === "vacations" ? "/vacations" : "/schedule/employee";
}

function setProjectMode(mode: "schedule" | "vacations") {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `schedule-project-mode=${mode}; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
  document.cookie = `schedule-embedded=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  document.cookie = `schedule-last-path=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function EmailAccessGate({
  token,
  email,
  mode,
}: EmailAccessGateProps) {
  const router = useRouter();
  const [state, setState] = useState<AccessState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function authorize() {
      if (!token && !email) {
        if (!cancelled) setState("blocked");
        return;
      }

      if (token) {
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname
        );
      }

      const currentSession = await getSession();
      if (currentSession?.user?.id) {
        await signOut({ redirect: false });
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

      setProjectMode(mode);
      router.replace(projectPath(mode));
      router.refresh();
    }

    authorize().catch(() => {
      if (!cancelled) setState("blocked");
    });

    return () => {
      cancelled = true;
    };
  }, [email, mode, router, token]);

  if (state === "checking") {
    return (
      <main
        aria-label={mode === "vacations" ? "Открываем отпуска" : "Открываем график"}
        className="min-h-screen bg-background text-foreground"
      >
        <div className="h-0.5 w-full overflow-hidden bg-muted">
          <div className="h-full w-full animate-pulse bg-primary" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground md:px-11">
      <section className="mx-auto w-full max-w-3xl">
        <LockKeyhole className="size-6 text-muted-foreground" strokeWidth={1.7} />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          Доступ к разделу закрыт
        </h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Откройте «График» или «Отпуска» через блок «Гриф» в Outline.
        </p>
      </section>
    </main>
  );
}
