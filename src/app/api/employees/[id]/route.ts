import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/auth-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const employee = await db.organizationMember.findFirst({
    where: {
      id,
      organizationId: member.organizationId,
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          nickname: true,
          profileImage: true,
          createdAt: true,
          patronymic: true,
        },
      },
    },
  });

  if (!employee) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  return NextResponse.json(employee);
}

export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "ФИО, email, язык и аватар управляются в Outline. Измените профиль пользователя в основной системе.",
    },
    { status: 409 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Пользователи управляются в Outline. Удалите пользователя или измените членство в группе Outline.",
    },
    { status: 409 }
  );
}
