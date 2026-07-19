"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Employee = {
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
  };
};

type EmployeeResponse = {
  division: { id: string; title: string };
  members: Employee[];
  counts: { all: number };
};

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function fullName(employee: Employee["user"]) {
  return [employee.lastName, employee.firstName, employee.patronymic]
    .filter(Boolean)
    .join(" ");
}

export function EmployeeList() {
  const router = useRouter();
  const tAbsences = useTranslations("absences");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<EmployeeResponse>({
    queryKey: ["employees"],
    queryFn: async () => {
      const response = await fetch("/api/employees?status=all");
      if (!response.ok) throw new Error("Не удалось загрузить сотрудников");
      return response.json();
    },
  });

  const members = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = data?.members ?? [];
    if (!query) return source;
    return source.filter((member) =>
      `${fullName(member.user)} ${member.user.email ?? ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [data?.members, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Сотрудники</h1>
          <p className="text-sm text-muted-foreground">
            {data?.division
              ? `Участники группы Outline «${data.division.title}»`
              : "Состав выбранной группы Outline"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/employees/absences")}
        >
          <CalendarDays className="size-4" />
          {tAbsences("title")}
        </Button>
      </div>

      <Card className="border-dashed p-3 text-sm text-muted-foreground">
        Добавление, удаление, ФИО, email, аватар и членство в отделах изменяются в Outline.
      </Card>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Найти сотрудника"
          className="pl-9"
        />
      </div>

      {isLoading && <EmployeeListSkeleton />}
      {error && (
        <Card className="p-6 text-center text-destructive">
          Не удалось загрузить сотрудников.
        </Card>
      )}
      {!isLoading && !error && members.length === 0 && (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Users className="mb-3 size-12 text-muted-foreground/50" />
          <p className="text-lg font-medium">Сотрудников нет</p>
        </Card>
      )}

      {!isLoading && !error && members.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-36">Роль</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((employee) => (
                <TableRow
                  key={employee.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/employees/${employee.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {employee.user.profileImage && (
                          <AvatarImage src={employee.user.profileImage} />
                        )}
                        <AvatarFallback>
                          {initials(
                            employee.user.firstName,
                            employee.user.lastName
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {fullName(employee.user)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          UUID: {employee.user.id}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{employee.user.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {employee.role === "ADMIN"
                        ? "Администратор Outline"
                        : "Сотрудник"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function EmployeeListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card key={index} className="flex items-center gap-3 p-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </Card>
      ))}
    </div>
  );
}
