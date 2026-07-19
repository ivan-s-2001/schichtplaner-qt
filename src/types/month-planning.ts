import type { ShiftTemplate } from "@/lib/schedule/shift-pool";

export type MonthPlanningStatus =
  | "COLLECTING_PREFERENCES"
  | "PLANNING"
  | "PUBLISHED"
  | "CLOSED";

export type MonthPreferenceKind = "PREFERRED" | "UNAVAILABLE";

export type MonthPlanningPeriod = {
  id: string;
  organizationId: string;
  divisionId: string;
  year: number;
  month: number;
  status: MonthPlanningStatus;
  preferenceDeadline: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MonthPreferenceItem = {
  id: string;
  workDate: string;
  kind: MonthPreferenceKind;
  shiftTemplateCode: string | null;
};

export type MonthPreference = {
  id: string;
  userId: string;
  comment: string | null;
  submittedAt: string | null;
  items: MonthPreferenceItem[];
};

export type MonthPlanningAssignment = {
  id: string;
  userId: string;
  workDate: string;
  shiftTemplateCode: string;
  updatedAt: string;
};

export type MonthPlanningMember = {
  id: string;
  firstName: string;
  lastName: string;
  patronymic: string | null;
  profileImage: string | null;
  role: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
};

export type MonthPreferenceResponse = {
  period: MonthPlanningPeriod | null;
  preference: MonthPreference | null;
  templates: ShiftTemplate[];
  canManage: boolean;
  editable: boolean;
};

export type MonthPlanningManagerResponse = {
  period: MonthPlanningPeriod;
  templates: ShiftTemplate[];
  members: MonthPlanningMember[];
  preferences: MonthPreference[];
  assignments: MonthPlanningAssignment[];
};
