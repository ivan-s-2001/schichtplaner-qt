"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  DataPanel,
  InlineNotice,
  PageHeader,
  PageToolbar,
  StatePanel,
} from "@/components/layout/page-primitives";

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
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Сотрудники"
        description={
          data?.division
            ? `Состав подразделения «${data.division.title}»`
            : "Состав выбранного подразделения"
        }
      />

      <InlineNotice>
        ФИО, email, аватар и членство в подразделениях изменяются в Outline.
        В этом разделе отображаются данные, необходимые для графика.
      </InlineNotice>

      <PageToolbar>
        <div className="text-sm text-muted-foreground">
          {data ? `${data.counts.all} сотрудников` : "Список сотрудников"}
        </div>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти сотрудника"
            className="pl-9"
          />
        </div>
      </PageToolbar>

      {isLoading && <EmployeeListSkeleton />}

      {error && (
        <StatePanel
          title="Не удалось загрузить сотрудников"
          description="Обновите страницу или повторите попытку позже."
          tone="danger"
        />
      )}

      {!isLoading && !error && members.length === 0 && (
        <StatePanel
          icon={Users}
          title={search ? "Сотрудники не найдены" : "Сотрудников пока нет"}
          description={
            search
              ? "Измените запрос поиска."
              : "Добавьте сотрудников в соответствующее подразделение Outline."
          }
        />
      )}

      {!isLoading && !error && members.length > 0 && (
        <DataPanel>
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
                        {employee.user.nickname && (
                          <div className="truncate text-xs text-muted-foreground">
                            {employee.user.nickname}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{employee.user.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {employee.role === "ADMIN"
                        ? "Администратор"
                        : employee.role === "MANAGER"
                          ? "Руководитель"
                          : "Сотрудник"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataPanel>
      )}
    </div>
  );
}

function EmployeeListSkeleton() {
  return (
    <DataPanel>
      <div className="divide-y">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </DataPanel>
  );
}
