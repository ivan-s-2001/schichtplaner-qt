import { EmailAccessGate } from "@/components/auth/email-access-gate";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;

  return (
    <EmailAccessGate
      token={firstValue(params.token)}
      email={firstValue(params.email)}
    />
  );
}
