"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, Send, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentMember } from "@/lib/hooks/use-current-member";

type EmployeeDetail = {
  id: string;
  role: string;
  isActive: boolean;
  isActivated: boolean;
  joinedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    patronymic: string | null;
    email: string | null;
    phone: string | null;
    nickname: string | null;
    profileImage: string | null;
    createdAt: string;
  };
};

type Note = {
  id: string;
  subjectId: string;
  authorId: string;
  text: string;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function EmployeeDetail({ memberId }: { memberId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentMember } = useCurrentMember();
  const [noteText, setNoteText] = useState("");

  const canManageNotes =
    currentMember?.role === "OWNER" ||
    currentMember?.role === "ADMIN" ||
    currentMember?.role === "MANAGER";

  const {
    data: employee,
    isLoading,
    error,
  } = useQuery<EmployeeDetail>({
    queryKey: ["employee", memberId],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${memberId}`);
      if (!response.ok) throw new Error("Сотрудник не найден");
      return response.json();
    },
  });

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["employee-notes", memberId],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${memberId}/notes`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: canManageNotes,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await fetch(`/api/employees/${memberId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Не удалось сохранить заметку");
      }
    },
    onSuccess: async () => {
      setNoteText("");
      toast.success("Заметка сохранена");
      await queryClient.invalidateQueries({
        queryKey: ["employee-notes", memberId],
      });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <Card className="p-8 text-center text-destructive">
        Сотрудник не найден.
      </Card>
    );
  }

  const displayName = [
    employee.user.lastName,
    employee.user.firstName,
    employee.user.patronymic,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="size-4" />
        Назад
      </Button>

      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar className="size-20">
            {employee.user.profileImage && (
              <AvatarImage src={employee.user.profileImage} />
            )}
            <AvatarFallback className="text-xl">
              {initials(employee.user.firstName, employee.user.lastName)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold">{displayName}</h1>
              <Badge variant="secondary">
                {employee.role === "ADMIN"
                  ? "Администратор Outline"
                  : "Сотрудник"}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-4" />
              {employee.user.email ?? "Email не указан"}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              UUID Outline: {employee.user.id}
            </div>
          </div>
        </div>
      </Card>

      <Card className="border-dashed p-4 text-sm text-muted-foreground">
        Личные данные, роль и членство в отделах изменяются в Outline. Расписание
        только читает профиль по UUID.
      </Card>

      {canManageNotes && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <StickyNote className="size-5 text-muted-foreground" />
            <h2 className="font-semibold">Служебные заметки расписания</h2>
          </div>

          <div className="flex gap-2">
            <Textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Добавить служебную заметку"
              rows={2}
            />
            <Button
              size="icon"
              disabled={!noteText.trim() || addNoteMutation.isPending}
              onClick={() => addNoteMutation.mutate(noteText.trim())}
            >
              <Send className="size-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {notes.length === 0 && (
              <p className="text-sm text-muted-foreground">Заметок нет.</p>
            )}
            {notes.map((note) => (
              <div key={note.id} className="rounded-md border p-3">
                <p className="whitespace-pre-wrap text-sm">{note.text}</p>
                <div className="mt-2 text-xs text-muted-foreground">
                  {note.author.lastName} {note.author.firstName} ·{" "}
                  {new Date(note.createdAt).toLocaleString("ru-RU")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
