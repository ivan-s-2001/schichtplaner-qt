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

  const organization = await db.organization.findUnique({
    where: { id: member.organizationId },
    include: {
      timeSettings: true,
      absenceCategories: { orderBy: { name: "asc" } },
      holidays: { orderBy: { date: "asc" } },
    },
  });

  if (!organization) {
    return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
  }

  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
      address: organization.address,
      nameFormat: organization.nameFormat,
      scheduleVisibility: organization.scheduleVisibility,
    },
    timeSettings: organization.timeSettings ?? {
      whoCanUse: "ALL",
      watchAutoStop: false,
      warningsEnabled: false,
      warningsMaxHours: 10,
      useCategories: false,
    },
    absenceCategories: organization.absenceCategories,
    holidays: organization.holidays,
  });
}

const updateSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  nameFormat: z
    .enum([
      "LASTNAME_FIRSTNAME",
      "FIRSTNAME_LASTNAME",
      "LASTNAME",
      "FIRSTNAME",
      "NICKNAME",
    ])
    .optional(),
  scheduleVisibility: z.enum(["ALL", "OWN_ONLY"]).optional(),
  timeSettings: z
    .object({
      whoCanUse: z.enum(["ALL", "CHOOSE"]).optional(),
      watchAutoStop: z.boolean().optional(),
      warningsEnabled: z.boolean().optional(),
      warningsMaxHours: z.number().int().min(1).max(24).optional(),
      useCategories: z.boolean().optional(),
    })
    .optional(),
  holidayCountry: z.string().min(2).max(2).optional(),
  holidayState: z.string().optional(),
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

  const data = parsed.data;
  const organizationData: Record<string, unknown> = {};
  if (data.name !== undefined) organizationData.name = data.name;
  if (data.address !== undefined) organizationData.address = data.address;
  if (data.nameFormat !== undefined) organizationData.nameFormat = data.nameFormat;
  if (data.scheduleVisibility !== undefined) {
    organizationData.scheduleVisibility = data.scheduleVisibility;
  }

  if (Object.keys(organizationData).length > 0) {
    await db.organization.update({
      where: { id: member.organizationId },
      data: organizationData,
    });
  }

  if (data.timeSettings) {
    await db.timeSettings.upsert({
      where: { organizationId: member.organizationId },
      create: {
        organizationId: member.organizationId,
        ...data.timeSettings,
      },
      update: data.timeSettings,
    });
  }

  return NextResponse.json({ success: true });
}
