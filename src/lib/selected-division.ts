import type { NextRequest } from "next/server";
import { resolveOutlineDivision } from "@/lib/outline-division-access";

export const DIVISION_COOKIE_NAME = "scheduleDivisionId";

export async function getSelectedDivision(
  request: NextRequest,
  userId: string,
  organizationId: string
) {
  return resolveOutlineDivision(
    userId,
    organizationId,
    request.cookies.get(DIVISION_COOKIE_NAME)?.value
  );
}
