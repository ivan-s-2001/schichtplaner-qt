import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";
import { getSelectedDivision } from "@/lib/selected-division";
import { startOfMonth, endOfMonth, parse } from "date-fns";

export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const selectedDivision = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!selectedDivision) {
    return NextResponse.json({ error: "Нет доступного отдела" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const monthParam = searchParams.get("month");
  const yearParam = searchParams.get("year");
  const userIdParam = searchParams.get("userId");
  const statusParam = searchParams.get("status");

  const divisionMembers = await db.divisionMember.findMany({
    where: { divisionId: selectedDivision.id },
    select: { userId: true },
  });
  const divisionUserIds = divisionMembers.map((item) => item.userId);

  const where: Record<string, unknown> = {
    userId: { in: divisionUserIds },
  };

  if (yearParam) {
    const year = parseInt(yearParam, 10);
    if (!Number.isNaN(year)) {
      where.dateFrom = { lte: new Date(`${year}-12-31`) };
      where.dateTo = { gte: new Date(`${year}-01-01`) };
    }
  } else if (monthParam) {
    const parsed = parse(monthParam, "yyyy-MM", new Date());
    if (!Number.isNaN(parsed.getTime())) {
      where.dateFrom = { lte: endOfMonth(parsed) };
      where.dateTo = { gte: startOfMonth(parsed) };
    }
  }

  if (userIdParam && divisionUserIds.includes(userIdParam)) {
    where.userId = userIdParam;
  }

  if (statusParam && ["PENDING", "APPROVED", "DECLINED"].includes(statusParam)) {
    where.status = statusParam;
  }

  const isAdmin = isAdminOrAbove(member.role);
  if (!isAdmin) {
    where.userId = member.user.id;
  }

  const absences = await db.absence.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          isPaid: true,
        },
      },
    },
    orderBy: { dateFrom: "asc" },
  });

  const allAbsences = await db.absence.findMany({
    where: {
      userId: isAdmin ? { in: divisionUserIds } : member.user.id,
    },
    select: { status: true },
  });

  const counts = {
    all: allAbsences.length,
    pending: allAbsences.filter((item) => item.status === "PENDING").length,
    approved: allAbsences.filter((item) => item.status === "APPROVED").length,
    declined: allAbsences.filter((item) => item.status === "DECLINED").length,
  };

  return NextResponse.json({ division: selectedDivision, absences, counts });
}

const createAbsenceSchema = z.object({
  userId: z.string().min(1),
  categoryId: z.string().min(1),
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
  note: z.string().optional(),
  status: z.enum(["PENDING", "APPROVED"]).optional(),
});

export async function POST(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const selectedDivision = await getSelectedDivision(
    request,
    member.userId,
    member.organizationId
  );
  if (!selectedDivision) {
    return NextResponse.json({ error: "Нет доступного отдела" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = createAbsenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const isAdmin = isAdminOrAbove(member.role);
  if (!isAdmin && data.userId !== member.user.id) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const targetDivisionMember = await db.divisionMember.findUnique({
    where: {
      divisionId_userId: {
        divisionId: selectedDivision.id,
        userId: data.userId,
      },
    },
  });
  if (!targetDivisionMember) {
    return NextResponse.json(
      { error: "Сотрудник не состоит в выбранном отделе" },
      { status: 404 }
    );
  }

  const category = await db.absenceCategory.findFirst({
    where: {
      id: data.categoryId,
      organizationId: member.organizationId,
    },
  });
  if (!category) {
    return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  }

  const dateFrom = new Date(`${data.dateFrom}T00:00:00.000Z`);
  const dateTo = new Date(`${data.dateTo}T00:00:00.000Z`);
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
    return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json(
      { error: "Начальная дата должна быть раньше конечной" },
      { status: 400 }
    );
  }

  const status = isAdmin && data.status === "APPROVED" ? "APPROVED" : "PENDING";
  const absence = await db.absence.create({
    data: {
      userId: data.userId,
      categoryId: data.categoryId,
      dateFrom,
      dateTo,
      note: data.note || null,
      status,
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          isPaid: true,
        },
      },
    },
  });

  return NextResponse.json({ absence }, { status: 201 });
}
