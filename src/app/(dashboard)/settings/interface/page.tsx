"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe2, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCurrentMember } from "@/lib/hooks/use-current-member";
import type { AppLocale } from "@/i18n/routing";

const languages: Array<{ value: AppLocale; label: string }> = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

export default function InterfaceSettingsPage() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const { data: member } = useCurrentMember();
  const [selectedLocale, setSelectedLocale] = useState<AppLocale>(locale);
  const [isSaving, setIsSaving] = useState(false);

  const canManageOrganization =
    member?.role === "OWNER" || member?.role === "ADMIN";

  async function saveLanguage() {
    if (selectedLocale === locale || isSaving) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: selectedLocale }),
      });

      if (!response.ok) {
        throw new Error("Не удалось сохранить язык");
      }

      toast.success("Язык интерфейса сохранён");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить язык"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Настройки интерфейса</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Персональные настройки этого браузера
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-0.5 size-5 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <h2 className="font-semibold">Язык интерфейса</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Выбор сохраняется локально и не меняет язык Outline.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 space-y-1.5">
                <span className="text-sm font-medium">Язык</span>
                <select
                  value={selectedLocale}
                  onChange={(event) =>
                    setSelectedLocale(event.target.value as AppLocale)
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {languages.map((language) => (
                    <option key={language.value} value={language.value}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                type="button"
                disabled={isSaving || selectedLocale === locale}
                onClick={() => void saveLanguage()}
              >
                {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {canManageOrganization && (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Settings2 className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">Настройки организации</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  График, сотрудники, отсутствия и системные параметры
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/settings">Открыть</Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
