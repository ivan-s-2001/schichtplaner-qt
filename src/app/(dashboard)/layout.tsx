import { cookies } from "next/headers";
import { TopNav, type ProjectMode } from "@/components/layout/top-nav";
import { OutlineThemeBridge } from "@/components/layout/outline-theme-bridge";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const rawMode = cookieStore.get("schedule-project-mode")?.value;
  const mode: ProjectMode = rawMode === "vacations" ? "vacations" : "schedule";

  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        storageKey="schichtplaner-theme"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <QueryProvider>
          <SocketProvider>
            <OutlineThemeBridge />
            <div
              data-outline-native-shell
              className="min-h-screen bg-background text-foreground"
            >
              <TopNav mode={mode} />
              <main className="w-full px-4 pb-16 pt-5 md:px-11 md:pb-20 md:pt-6">
                <div className="mx-auto w-full max-w-[1600px]">{children}</div>
              </main>
            </div>
            <Toaster position="top-right" richColors={false} />
          </SocketProvider>
        </QueryProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
