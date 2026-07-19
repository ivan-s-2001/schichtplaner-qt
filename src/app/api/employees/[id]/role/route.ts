import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "Права пользователя определяются ролью и членством в группах Outline.",
    },
    { status: 409 }
  );
}
