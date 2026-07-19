import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";
import { isVacationCategoryName } from "@/lib/vacation";

const updateAbsenceSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "DECLINED"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  note: z.string().nullable().optional(),
  categoryId: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = isAdminOrAbove(member.role);
  const absence = await db.absence.findUnique({
    where: { id },
    include: { user: true, category: true },
  });

  if (!absence) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isVacationCategoryName(absence.category.name)) {
    return NextResponse.json(
      { error: "Отпуск изменяется на отдельной странице «Отпуск»" },
      { status: 409 }
    );
  }

  const orgMember = await db.organizationMember.findFirst({
    where: {
      organizationId: member.organizationId,
      userId: absence.userId,
      isActive: true,
    },
  });
  if (!orgMember) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const parsed = updateAbsenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  if (data.status && (data.status === "APPROVED" || data.status === "DECLINED")) {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only admins can approve or decline absences" },
        { status: 403 }
      );
    }
  }

  if (!isAdmin) {
    if (absence.userId !== member.user.id) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }
    if (absence.status !== "PENDING") {
      return NextResponse.json(
        { error: "Can only edit pending absences" },
        { status: 400 }
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (data.dateFrom !== undefined) {
    updateData.dateFrom = new Date(data.dateFrom + "T00:00:00.000Z");
  }
  if (data.dateTo !== undefined) {
    updateData.dateTo = new Date(data.dateTo + "T00:00:00.000Z");
  }
  if (data.note !== undefined) updateData.note = data.note;
  if (data.categoryId !== undefined) {
    const category = await db.absenceCategory.findFirst({
      where: {
        id: data.categoryId,
        organizationId: member.organizationId,
      },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (isVacationCategoryName(category.name)) {
      return NextResponse.json(
        { error: "Отпуск добавляется на отдельной странице «Отпуск»" },
        { status: 409 }
      );
    }
    updateData.categoryId = data.categoryId;
  }

  const updated = await db.absence.update({
    where: { id },
    data: updateData,
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

  return NextResponse.json({ absence: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = isAdminOrAbove(member.role);
  const absence = await db.absence.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!absence) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isVacationCategoryName(absence.category.name)) {
    return NextResponse.json(
      { error: "Отпуск удаляется на отдельной странице «Отпуск»" },
      { status: 409 }
    );
  }

  const orgMember = await db.organizationMember.findFirst({
    where: {
      organizationId: member.organizationId,
      userId: absence.userId,
      isActive: true,
    },
  });
  if (!orgMember) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isAdmin) {
    if (absence.userId !== member.user.id) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }
    if (absence.status !== "PENDING") {
      return NextResponse.json(
        { error: "Can only delete pending absences" },
        { status: 400 }
      );
    }
  }

  await db.absence.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
