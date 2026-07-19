CREATE TABLE IF NOT EXISTS schedule."vacation_allowances" (
  "organizationId" UUID NOT NULL REFERENCES public.teams("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "year" INTEGER NOT NULL,
  "days" INTEGER NOT NULL DEFAULT 20 CHECK ("days" BETWEEN 0 AND 366),
  "updatedById" UUID REFERENCES public.users("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("organizationId", "userId", "year")
);
