import { NextResponse } from "next/server";

const response = () =>
  NextResponse.json(
    {
      error:
        "Отдел соответствует группе Outline. Название, описание и состав изменяются в Outline.",
    },
    { status: 409 }
  );

export async function PATCH() {
  return response();
}

export async function DELETE() {
  return response();
}
