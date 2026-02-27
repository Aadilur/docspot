import localforage from "localforage";

export type StoredFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type StoredAudioNote = {
  blob: Blob;
  durationSec: number;
};

export type PrescriptionRecord = {
  id: string;
  title: string;
  issueDate: string; // YYYY-MM-DD
  nextAppointment: string; // YYYY-MM-DD
  textNote: string;
  files: StoredFile[];
  audioNote: StoredAudioNote | null;
  createdAt: string;
  updatedAt: string;
};

const store = localforage.createInstance({
  name: "docspot",
  storeName: "prescriptions",
});

const KEY = "prescriptions:v1";

export async function listPrescriptions(): Promise<PrescriptionRecord[]> {
  const result = await store.getItem<PrescriptionRecord[]>(KEY);
  return Array.isArray(result) ? result : [];
}

export async function upsertPrescription(
  record: PrescriptionRecord,
): Promise<void> {
  const current = await listPrescriptions();
  const idx = current.findIndex((r) => r.id === record.id);
  if (idx >= 0) current[idx] = record;
  else current.unshift(record);
  await store.setItem(KEY, current);
}

export async function deletePrescription(id: string): Promise<void> {
  const current = await listPrescriptions();
  await store.setItem(
    KEY,
    current.filter((r) => r.id !== id),
  );
}
