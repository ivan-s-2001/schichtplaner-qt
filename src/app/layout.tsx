import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { OutlineThemeBridge } from "@/components/layout/outline-theme-bridge";
import "./globals.css";
import "./outline-native.css";
import "./schedule-editors.css";

function externalOrigin(value: string | undefined, fallback: string): string {
  try {
    return new URL(value || fallback).origin;
  } catch {
    return fallback;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const title = t("title");
  const description = t("description");

  return {
    title: {
      default: title,
      template: `%s | ${title}`,
    },
    description,
    metadataBase: new URL(
      process.env.APP_URL || "https://schedule.qt.local"
    ),
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const outlineOrigin = externalOrigin(
    process.env.OUTLINE_URL,
    "https://outline.qt.local"
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <OutlineThemeBridge outlineOrigin={outlineOrigin} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
