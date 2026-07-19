"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SupportedLocale = "ru" | "de" | "en";

interface InterfaceSettingsProps {
  locale: string | null | undefined;
}

const languageOptions: Array<{ value: SupportedLocale; label: string }> = [
  { value: "ru", label: "Русский" },
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
];

export function InterfaceSettings({ locale }: InterfaceSettingsProps) {
  const router = useRouter();
  const initialLocale = languageOptions.some((item) => item.value === locale)
    ? (locale as SupportedLocale)
    : "ru";
  const [selectedLocale, setSelectedLocale] =
    useState<SupportedLocale>(initialLocale);
  const [isSaving, setIsSaving] = useState(false);

  async function saveLanguage() {
    setIsSaving(true);

    try {
      const response = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: selectedLocale }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Не удалось сохранить язык");
      }

      toast.success("Язык интерфейса сохранён");
      router.refresh();
      window.location.reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить язык"
      );
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Интерфейс</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Персональные настройки только для вашей учётной записи
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-0.5 size-5 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <h3 className="font-medium">Язык интерфейса</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Язык сохраняется отдельно для каждого пользователя расписания.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 space-y-1.5">
                <span className="text-sm font-medium">Язык</span>
                <select
                  value={selectedLocale}
                  onChange={(event) =>
                    setSelectedLocale(event.target.value as SupportedLocale)
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {languageOptions.map((language) => (
                    <option key={language.value} value={language.value}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                type="button"
                disabled={isSaving || selectedLocale === initialLocale}
                onClick={() => void saveLanguage()}
              >
                {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
