import { cookies } from "next/headers";
import { TopNav } from "@/components/layout/top-nav";
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
  const embedded = cookieStore.get("schedule-embedded")?.value === "1";

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
              {!embedded && <TopNav />}
              <main
                className={
                  embedded
                    ? "w-full min-w-0 px-3 py-3 md:px-4 md:py-4"
                    : "mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6 md:py-6 lg:px-8"
                }
              >
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
