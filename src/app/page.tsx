import { EmailAccessGate } from "@/components/auth/email-access-gate";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const returnTo = first(params.returnTo);
  const mode =
    first(params.mode) === "vacations" ||
    first(params.embed) === "1" ||
    returnTo === "/vacations" ||
    returnTo === "/employees/absences"
      ? "vacations"
      : "schedule";

  return (
    <EmailAccessGate
      userId={first(params.userId)}
      teamId={first(params.teamId)}
      signature={first(params.signature)}
      token={first(params.token)}
      email={first(params.email)}
      mode={mode}
    />
  );
}
