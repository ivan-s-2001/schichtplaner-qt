import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentMember, isAdminOrAbove } from "@/lib/auth-helpers";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  if (!isAdminOrAbove(member.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const [workspace, timeSettings, absenceCategories, holidays] =
    await Promise.all([
      db.organization.findUnique({ where: { id: member.organizationId } }),
      db.timeSettings.findUnique({
        where: { organizationId: member.organizationId },
      }),
      db.absenceCategory.findMany({
        where: { organizationId: member.organizationId },
        orderBy: { name: "asc" },
      }),
      db.holiday.findMany({
        where: { organizationId: member.organizationId },
        orderBy: { date: "asc" },
      }),
    ]);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace Outline не найден" }, { status: 404 });
  }

  return NextResponse.json({
    organization: {
      id: workspace.id,
      name: workspace.name,
      address: null,
      nameFormat: "LASTNAME_FIRSTNAME",
      scheduleVisibility: "ALL",
      managedByOutline: true,
    },
    timeSettings: timeSettings ?? {
      whoCanUse: "ALL",
      watchAutoStop: false,
      warningsEnabled: false,
      warningsMaxHours: 10,
      useCategories: false,
    },
    absenceCategories,
    holidays,
  });
}

const updateSettingsSchema = z.object({
  timeSettings: z
    .object({
      whoCanUse: z.enum(["ALL", "CHOOSE"]).optional(),
      watchAutoStop: z.boolean().optional(),
      warningsEnabled: z.boolean().optional(),
      warningsMaxHours: z.number().int().min(1).max(24).optional(),
      useCategories: z.boolean().optional(),
    })
    .optional(),
});

export async function PATCH(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  if (!isAdminOrAbove(member.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const parsed = updateSettingsSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка проверки данных", details: parsed.error.issues },
      { status: 400 }
    );
  }

  if (parsed.data.timeSettings) {
    await db.timeSettings.upsert({
      where: { organizationId: member.organizationId },
      create: {
        organizationId: member.organizationId,
        ...parsed.data.timeSettings,
      },
      update: parsed.data.timeSettings,
    });
  }

  return NextResponse.json({ success: true });
}
