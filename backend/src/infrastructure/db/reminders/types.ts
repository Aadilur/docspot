// Reminder DB types.
//
// Keep these types framework-agnostic so they can be shared across modules.

export type MedicineType = "pill" | "syrup" | "injection" | "inhaler" | "other";

export type InstructionTag =
  | "before_meal"
  | "after_meal"
  | "with_food"
  | "empty_stomach"
  | "none";

export type RepeatType = "once" | "daily" | "weekly" | "interval";

export type IntakeStatus = "pending" | "taken" | "missed" | "skipped";

export type ReminderSettings = {
  timezone: string;
  reminderOffsetMinutes: number;
  reminderGraceMinutes: number;
};

export type MedicineRecord = {
  id: string;
  userId: string;
  name: string;
  type: MedicineType;
  dosePerIntake: number;
  doseUnit: string | null;
  stockTotal: number | null;
  stockRemaining: number | null;
  lowStockThreshold: number;
  instructionTag: InstructionTag;
  note: string | null;
  photoUrl: string | null;
  photoKey?: string | null;
  voiceNoteUrl?: string | null;
  voiceNoteKey?: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RemovedMedicineRecord = {
  id: string;
  userId: string;
  name: string;
  type: MedicineType;
  dosePerIntake: number;
  doseUnit: string | null;
  removedAt: string;
  createdAt: string;
};

export type ScheduleRecord = {
  id: string;
  medicineId: string;
  repeatType: RepeatType;
  intervalValue: number | null;
  selectedDays: number[] | null; // 0 (Sun) .. 6 (Sat)
  times: string[]; // HH:mm:ss
  doseByTime: Record<string, number> | null; // key: HH:mm
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  maxOccurrences: number | null;
  createdAt: string;
  updatedAt: string;
};

export type IntakeEventRecord = {
  id: string;
  scheduleId: string;
  medicineId: string;
  userId: string;
  datetimeUtc: string;
  status: IntakeStatus;
  takenAtUtc: string | null;
  skippedReason: string | null;
  createdAt: string;
  metadata: unknown | null;
};

export type TimelineItem = IntakeEventRecord & {
  medicine: Pick<
    MedicineRecord,
    "id" | "name" | "type" | "dosePerIntake" | "doseUnit"
  >;
};

export type CaregiverLinkStatus = "pending" | "accepted" | "rejected";

export type CaregiverAccessLevel = "view" | "edit" | "full";

export type CaregiverLinkRecord = {
  id: string;
  patientId: string;
  caregiverId: string;
  status: CaregiverLinkStatus;
  accessLevel: CaregiverAccessLevel;
  caregiverAlias: string | null;
  createdAt: string;
};

export type CaregiverRequestItem = {
  link: CaregiverLinkRecord;
  patient: {
    id: string;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  };
};

export type CaregiverPatientItem = {
  link: CaregiverLinkRecord;
  patient: {
    id: string;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  };
};

export type AuditLogRecord = {
  id: string;
  userId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown | null;
  createdAt: string;
  actor?: {
    id: string;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  } | null;
};

export type UpcomingIntakeItem = IntakeEventRecord & {
  medicine: Pick<MedicineRecord, "id" | "name" | "type" | "dosePerIntake">;
};
