import { cookies } from "next/headers";
import { TopNav, type ProjectMode } from "@/components/layout/top-nav";
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
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <QueryProvider>
          <SocketProvider>
            <div className="min-h-screen bg-background text-foreground">
              <TopNav mode={mode} />
              <main className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6 md:py-6 lg:px-8">
                {children}
              </main>
            </div>
            <Toaster position="top-right" richColors={false} />
          </SocketProvider>
        </QueryProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
