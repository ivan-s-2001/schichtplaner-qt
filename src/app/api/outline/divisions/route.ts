import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth-helpers";
import {
  getOutlineDivisions,
  resolveOutlineDivision,
} from "@/lib/outline-division-access";

const COOKIE_NAME = "scheduleDivisionId";
const selectSchema = z.object({
  divisionId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const divisions = await getOutlineDivisions(
    member.userId,
    member.organizationId
  );
  const selected = await resolveOutlineDivision(
    member.userId,
    member.organizationId,
    request.cookies.get(COOKIE_NAME)?.value
  );

  const response = NextResponse.json({ divisions, selected });
  if (selected) {
    response.cookies.set(COOKIE_NAME, selected.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 365 * 24 * 60 * 60,
      path: "/",
    });
  }

  return response;
}

export async function POST(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const parsed = selectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный отдел" }, { status: 400 });
  }

  const divisions = await getOutlineDivisions(
    member.userId,
    member.organizationId
  );
  const selected = divisions.find(
    (division) => division.id === parsed.data.divisionId
  );

  if (!selected) {
    return NextResponse.json({ error: "Нет доступа к отделу" }, { status: 403 });
  }

  const response = NextResponse.json({ selected });
  response.cookies.set(COOKIE_NAME, selected.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
  });
  return response;
}
