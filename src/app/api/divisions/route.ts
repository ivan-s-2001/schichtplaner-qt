import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth-helpers";
import { getOutlineDivisions } from "@/lib/outline-division-access";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const divisions = await getOutlineDivisions(
    member.userId,
    member.organizationId
  );

  return NextResponse.json({
    divisions: divisions.map((division) => ({
      ...division,
      isSystem: false,
      memberCount: null,
      createdAt: null,
      managedByOutline: true,
    })),
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Подразделения создаются администратором в настройках Outline.",
    },
    { status: 409 }
  );
}
