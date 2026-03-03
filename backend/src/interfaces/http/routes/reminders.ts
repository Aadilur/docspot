import type { Router } from "express";

import { DateTime } from "luxon";

import * as remindersDb from "../../../infrastructure/db/reminders";
import { createPresignedGetUrl } from "../../../infrastructure/storage/s3";
import {
  getUserByEmail,
  getUserByPhone,
} from "../../../infrastructure/db/users";

type EnsureMe = (req: any) => Promise<{ id: string }>;

function getQueryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function registerReminderRoutes(params: {
  router: Router;
  requireFirebaseAuth: any;
  ensureMe: EnsureMe;
  parseBoundedInt: (
    raw: string,
    defaultValue: number,
    min: number,
    max: number,
  ) => number;
  badRequest: (res: any, error: string) => any;
  notFound: (res: any) => any;
  unavailable: (res: any, err: unknown) => any;
  assertKeyInUserDrive: (params: { userId: string; key: string }) => void;
  toErrorMessage: (err: unknown) => string;
  ATTACHMENT_URL_EXPIRES_SECONDS: number;
}): void {
  const {
    router,
    requireFirebaseAuth,
    ensureMe,
    parseBoundedInt,
    badRequest,
    notFound,
    unavailable,
    assertKeyInUserDrive,
    toErrorMessage,
    ATTACHMENT_URL_EXPIRES_SECONDS,
  } = params;

  // Reminder settings (timezone + notification offset + grace period).
  router.get("/me/reminder-settings", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const settings = await remindersDb.getReminderSettings(me.id);
      res.json({ ok: true, settings });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.get(
    "/caregiver/reminder-settings",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }

        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "view",
        });

        const settings = await remindersDb.getReminderSettings(patientId);
        res.json({ ok: true, settings });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.patch(
    "/me/reminder-settings",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const body = (req as any).body ?? {};
        const patch: any = {};

        if (Object.prototype.hasOwnProperty.call(body, "timezone")) {
          patch.timezone = body.timezone;
        }
        if (
          Object.prototype.hasOwnProperty.call(body, "reminderOffsetMinutes")
        ) {
          patch.reminderOffsetMinutes = body.reminderOffsetMinutes;
        }
        if (
          Object.prototype.hasOwnProperty.call(body, "reminderGraceMinutes")
        ) {
          patch.reminderGraceMinutes = body.reminderGraceMinutes;
        }

        const settings = await remindersDb.patchReminderSettings({
          userId: me.id,
          patch,
        });

        res.json({ ok: true, settings });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  // Medicines.
  router.get("/me/medicines", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const limit = parseBoundedInt(
        getQueryString(req.query?.limit),
        50,
        1,
        100,
      );
      const offset = parseBoundedInt(
        getQueryString(req.query?.offset),
        0,
        0,
        100_000,
      );
      const includeArchived =
        getQueryString(req.query?.includeArchived) === "true";

      const medicines = await remindersDb.listMedicines({
        userId: me.id,
        limit,
        offset,
        includeArchived,
      });

      res.json({ ok: true, medicines });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.get("/me/medicines/:id", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const medicine = await remindersDb.getMedicine({
        userId: me.id,
        medicineId: req.params.id,
      });
      if (!medicine) {
        notFound(res);
        return;
      }
      res.json({ ok: true, medicine });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.post("/me/medicines", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const body = (req as any).body ?? {};

      const photoKey =
        typeof body.photoKey === "string" ? body.photoKey.trim() : "";
      const voiceNoteKey =
        typeof body.voiceNoteKey === "string" ? body.voiceNoteKey.trim() : "";
      if (photoKey) assertKeyInUserDrive({ userId: me.id, key: photoKey });
      if (voiceNoteKey)
        assertKeyInUserDrive({ userId: me.id, key: voiceNoteKey });

      const created = await remindersDb.createMedicine({
        userId: me.id,
        name: typeof body.name === "string" ? body.name : "",
        type: body.type,
        dosePerIntake:
          typeof body.dosePerIntake === "number"
            ? body.dosePerIntake
            : Number(body.dosePerIntake),
        doseUnit: typeof body.doseUnit === "string" ? body.doseUnit : null,
        stockTotal: body.stockTotal == null ? null : Number(body.stockTotal),
        stockRemaining:
          body.stockRemaining == null ? null : Number(body.stockRemaining),
        lowStockThreshold:
          body.lowStockThreshold == null
            ? undefined
            : Number(body.lowStockThreshold),
        instructionTag: body.instructionTag,
        note: body.note ?? null,
        photoUrl: body.photoUrl ?? null,
        photoKey: photoKey || null,
        voiceNoteKey: voiceNoteKey || null,
      });

      res.json({ ok: true, medicine: created });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.get(
    "/me/medicines/:id/history",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);

        const medicine = await remindersDb.getMedicine({
          userId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          50,
          1,
          500,
        );
        const offset = parseBoundedInt(
          getQueryString(req.query?.offset),
          0,
          0,
          100_000,
        );
        const daysRaw = getQueryString(req.query?.days);
        const days = daysRaw ? Number(daysRaw) : null;

        const events = await remindersDb.listMedicineIntakeHistory({
          userId: me.id,
          medicineId: req.params.id,
          limit,
          offset,
          days: Number.isFinite(days) ? (days as number) : undefined,
        });

        res.json({ ok: true, events });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/medicines/:id/upcoming",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);

        const medicine = await remindersDb.getMedicine({
          userId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        const daysAhead = parseBoundedInt(
          getQueryString(req.query?.daysAhead),
          7,
          1,
          31,
        );
        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          30,
          1,
          500,
        );

        const untilUtc = DateTime.utc().plus({ days: daysAhead }).toISO();
        if (!untilUtc) {
          badRequest(res, "could not determine date range");
          return;
        }

        const items = await remindersDb.listUpcomingIntakeEventsForMedicine({
          userId: me.id,
          medicineId: req.params.id,
          untilUtc,
          limit,
        });

        res.json({ ok: true, items });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/medicines/:id/photo",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const medicine = await remindersDb.getMedicine({
          userId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        if (!medicine.photoKey) {
          if (medicine.photoUrl) {
            res.redirect(302, medicine.photoUrl);
            return;
          }
          notFound(res);
          return;
        }

        const signed = await createPresignedGetUrl({
          key: medicine.photoKey,
          expiresInSeconds: ATTACHMENT_URL_EXPIRES_SECONDS,
        });
        res.redirect(302, signed.url);
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/medicines/:id/photo/url",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const medicine = await remindersDb.getMedicine({
          userId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        if (medicine.photoKey) {
          const signed = await createPresignedGetUrl({
            key: medicine.photoKey,
            expiresInSeconds: ATTACHMENT_URL_EXPIRES_SECONDS,
          });
          res.json({ ok: true, url: signed.url });
          return;
        }

        if (medicine.photoUrl) {
          res.json({ ok: true, url: medicine.photoUrl });
          return;
        }

        notFound(res);
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/medicines/:id/voice-note",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const medicine = await remindersDb.getMedicine({
          userId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        if (!medicine.voiceNoteKey) {
          notFound(res);
          return;
        }

        const signed = await createPresignedGetUrl({
          key: medicine.voiceNoteKey,
          expiresInSeconds: ATTACHMENT_URL_EXPIRES_SECONDS,
        });
        res.redirect(302, signed.url);
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/medicines/:id/voice-note/url",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const medicine = await remindersDb.getMedicine({
          userId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        if (!medicine.voiceNoteKey) {
          notFound(res);
          return;
        }

        const signed = await createPresignedGetUrl({
          key: medicine.voiceNoteKey,
          expiresInSeconds: ATTACHMENT_URL_EXPIRES_SECONDS,
        });
        res.json({ ok: true, url: signed.url });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get("/me/medicines/:id", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const medicine = await remindersDb.getMedicine({
        userId: me.id,
        medicineId: req.params.id,
      });
      if (!medicine) {
        notFound(res);
        return;
      }
      res.json({ ok: true, medicine });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.patch("/me/medicines/:id", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const body = (req as any).body ?? {};

      const patch: any = {};

      if (typeof body.name === "string") patch.name = body.name;
      if (body.type != null) patch.type = body.type;
      if (body.dosePerIntake != null) patch.dosePerIntake = body.dosePerIntake;
      if (body.doseUnit !== undefined)
        patch.doseUnit =
          typeof body.doseUnit === "string" ? body.doseUnit : null;
      if (body.stockTotal !== undefined)
        patch.stockTotal =
          body.stockTotal == null ? null : Number(body.stockTotal);
      if (body.stockRemaining !== undefined)
        patch.stockRemaining =
          body.stockRemaining == null ? null : Number(body.stockRemaining);
      if (body.lowStockThreshold !== undefined)
        patch.lowStockThreshold = Number(body.lowStockThreshold);
      if (body.instructionTag !== undefined)
        patch.instructionTag = body.instructionTag;
      if (body.note !== undefined)
        patch.note = typeof body.note === "string" ? body.note : null;
      if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);

      const medicine = await remindersDb.patchMedicine({
        userId: me.id,
        medicineId: req.params.id,
        patch,
      });

      if (!medicine) {
        notFound(res);
        return;
      }
      res.json({ ok: true, medicine });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.patch(
    "/me/medicines/:id/archive",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const medicine = await remindersDb.archiveMedicine({
          userId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }
        res.json({ ok: true, medicine });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  // Schedules.
  router.get(
    "/me/medicines/:id/schedules",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const schedules = await remindersDb.listSchedules({
          userId: me.id,
          medicineId: req.params.id,
        });
        res.json({ ok: true, schedules });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.post(
    "/me/medicines/:id/schedules",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const body = (req as any).body ?? {};

        const schedule = await remindersDb.createSchedule({
          userId: me.id,
          medicineId: req.params.id,
          repeatType: body.repeatType,
          intervalValue: body.intervalValue ?? null,
          selectedDays: body.selectedDays ?? null,
          times: Array.isArray(body.times) ? body.times : [],
          doseByTime: body.doseByTime ?? null,
          startDate: typeof body.startDate === "string" ? body.startDate : "",
          endDate: body.endDate ?? null,
          maxOccurrences: body.maxOccurrences ?? null,
        });

        res.json({ ok: true, schedule });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  // Timeline.
  router.get(
    "/me/reminders/timeline/today",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        // Optional override: ?date=YYYY-MM-DD (in user's timezone)
        const date = getQueryString(req.query?.date);

        let localDate = date;
        if (!localDate) {
          const settings = await remindersDb.getReminderSettings(me.id);
          const nowLocal = DateTime.utc().setZone(settings.timezone);
          localDate = nowLocal.isValid ? (nowLocal.toISODate() ?? "") : "";
        }

        if (!localDate) {
          badRequest(res, "could not determine local date");
          return;
        }

        const items = await remindersDb.getTimelineForLocalDate({
          userId: me.id,
          localDate,
        });
        res.json({ ok: true, items });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/reminders/upcoming",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);

        const daysAhead = parseBoundedInt(
          getQueryString(req.query?.daysAhead),
          7,
          1,
          31,
        );
        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          200,
          1,
          2000,
        );

        const untilUtc = DateTime.utc().plus({ days: daysAhead }).toISO();
        if (!untilUtc) {
          badRequest(res, "could not determine date range");
          return;
        }

        const items = await remindersDb.listUpcomingIntakeEvents({
          userId: me.id,
          untilUtc,
          limit,
        });

        res.json({ ok: true, items });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/caregiver/reminders/upcoming",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }

        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "view",
        });

        const daysAhead = parseBoundedInt(
          getQueryString(req.query?.daysAhead),
          7,
          1,
          31,
        );
        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          200,
          1,
          2000,
        );

        const untilUtc = DateTime.utc().plus({ days: daysAhead }).toISO();
        if (!untilUtc) {
          badRequest(res, "could not determine date range");
          return;
        }

        const items = await remindersDb.listUpcomingIntakeEvents({
          userId: patientId,
          untilUtc,
          limit,
        });

        res.json({ ok: true, items });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  // Intake updates.
  router.patch(
    "/me/reminders/intake/:id/taken",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const idem =
          typeof req.header("Idempotency-Key") === "string"
            ? String(req.header("Idempotency-Key"))
            : null;

        const result = await remindersDb.markIntakeEventTaken({
          userId: me.id,
          intakeEventId: req.params.id,
          idempotencyKey: idem,
        });

        res.json({ ok: true, ...result });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.patch(
    "/me/reminders/intake/:id/skipped",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const body = (req as any).body ?? {};
        const reason = typeof body.reason === "string" ? body.reason : null;

        const event = await remindersDb.markIntakeEventSkipped({
          userId: me.id,
          intakeEventId: req.params.id,
          reason,
        });

        res.json({ ok: true, event });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/medicines/:id/history",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          50,
          1,
          100,
        );
        const offset = parseBoundedInt(
          getQueryString(req.query?.offset),
          0,
          0,
          100_000,
        );

        const events = await remindersDb.listMedicineHistory({
          userId: me.id,
          medicineId: req.params.id,
          limit,
          offset,
        });

        res.json({ ok: true, events });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.get(
    "/me/medicines/:id/logs",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const medicine = await remindersDb.getMedicine({
          userId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          25,
          1,
          50,
        );
        const offset = parseBoundedInt(
          getQueryString(req.query?.offset),
          0,
          0,
          100,
        );

        const result = await remindersDb.listMedicineActivityLogs({
          userId: me.id,
          medicineId: req.params.id,
          limit,
          offset,
        });

        res.json({ ok: true, ...result });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  // Caregiver flow.
  router.post("/me/caregiver/invite", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const body = (req as any).body ?? {};

      let caregiverId =
        typeof body.caregiverId === "string" ? body.caregiverId : "";

      const caregiverContactRaw =
        typeof body.caregiverContact === "string"
          ? body.caregiverContact
          : typeof body.contact === "string"
            ? body.contact
            : "";
      const caregiverContact = caregiverContactRaw.trim();

      if (!caregiverId && caregiverContact) {
        // Minimal heuristic: if it contains '@' treat as email, otherwise phone.
        if (caregiverContact.includes("@")) {
          const u = await getUserByEmail(caregiverContact);
          caregiverId = u?.id ?? "";
        } else {
          const normalizedPhone = caregiverContact.replace(/[\s()-]/g, "");
          const u = await getUserByPhone(normalizedPhone);
          caregiverId = u?.id ?? "";
        }
      }

      if (!caregiverId) {
        badRequest(res, "caregiverId or caregiverContact is required");
        return;
      }

      const rawLevel =
        typeof body.accessLevel === "string"
          ? body.accessLevel
          : typeof body.access === "string"
            ? body.access
            : "view";
      const accessLevel =
        rawLevel === "view" || rawLevel === "edit" || rawLevel === "full"
          ? rawLevel
          : "view";

      const link = await remindersDb.inviteCaregiver({
        patientId: me.id,
        caregiverId,
        accessLevel,
      });

      res.json({ ok: true, link });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.get(
    "/me/caregiver/requests",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const items = await remindersDb.listCaregiverRequests({
          caregiverId: me.id,
        });
        res.json({ ok: true, items });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/caregiver/patients",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const items = await remindersDb.listCaregiverPatients({
          caregiverId: me.id,
        });
        res.json({ ok: true, items });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get("/me/caregiver/link", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const patientId = getQueryString(req.query?.patientId);
      if (!patientId) {
        badRequest(res, "patientId is required");
        return;
      }
      const link = await remindersDb.getCaregiverLink({
        caregiverId: me.id,
        patientId,
      });
      res.json({ ok: true, link });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.patch(
    "/me/caregiver/patients/:patientId",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const body = (req as any).body ?? {};
        const alias =
          typeof body.alias === "string"
            ? body.alias
            : body.alias == null
              ? null
              : String(body.alias);

        const link = await remindersDb.patchCaregiverAlias({
          caregiverId: me.id,
          patientId: req.params.patientId,
          alias,
        });

        res.json({ ok: true, link });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.post("/me/caregiver/reject", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const body = (req as any).body ?? {};
      const patientId =
        typeof body.patientId === "string" ? body.patientId : "";
      if (!patientId) {
        badRequest(res, "patientId is required");
        return;
      }

      const link = await remindersDb.rejectCaregiverInvite({
        caregiverId: me.id,
        patientId,
      });
      res.json({ ok: true, link });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.post("/me/caregiver/accept", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const body = (req as any).body ?? {};
      const patientId =
        typeof body.patientId === "string" ? body.patientId : "";
      if (!patientId) {
        badRequest(res, "patientId is required");
        return;
      }

      const link = await remindersDb.acceptCaregiverInvite({
        caregiverId: me.id,
        patientId,
      });

      res.json({ ok: true, link });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  // Caregiver read-only access: same endpoints but with `?patientId=<uuid>`.
  router.get("/caregiver/medicines", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const patientId = getQueryString(req.query?.patientId);
      if (!patientId) {
        badRequest(res, "patientId is required");
        return;
      }

      await remindersDb.requireCaregiverAccessLevel({
        caregiverId: me.id,
        patientId,
        minLevel: "view",
      });

      const limit = parseBoundedInt(
        getQueryString(req.query?.limit),
        50,
        1,
        100,
      );
      const offset = parseBoundedInt(
        getQueryString(req.query?.offset),
        0,
        0,
        100_000,
      );

      const medicines = await remindersDb.listMedicines({
        userId: patientId,
        limit,
        offset,
        includeArchived: true,
      });

      res.json({ ok: true, medicines });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.get(
    "/caregiver/medicines/:id",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "view",
        });

        const medicine = await remindersDb.getMedicine({
          userId: patientId,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }
        res.json({ ok: true, medicine });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/caregiver/medicines/:id/history",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "view",
        });

        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          50,
          1,
          100,
        );
        const offset = parseBoundedInt(
          getQueryString(req.query?.offset),
          0,
          0,
          100_000,
        );

        const events = await remindersDb.listMedicineHistory({
          userId: patientId,
          medicineId: req.params.id,
          limit,
          offset,
        });
        res.json({ ok: true, events });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/caregiver/medicines/:id/logs",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "view",
        });

        const medicine = await remindersDb.getMedicine({
          userId: patientId,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          25,
          1,
          50,
        );
        const offset = parseBoundedInt(
          getQueryString(req.query?.offset),
          0,
          0,
          100,
        );

        const result = await remindersDb.listMedicineActivityLogs({
          userId: patientId,
          medicineId: req.params.id,
          limit,
          offset,
        });

        res.json({ ok: true, ...result });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.patch(
    "/caregiver/medicines/:id",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "edit",
        });

        const body = (req as any).body ?? {};
        const patch: any = {};

        for (const key of [
          "name",
          "type",
          "dosePerIntake",
          "doseUnit",
          "stockTotal",
          "stockRemaining",
          "lowStockThreshold",
          "instructionTag",
          "note",
          "isActive",
        ]) {
          if (Object.prototype.hasOwnProperty.call(body, key)) {
            patch[key] = body[key];
          }
        }

        const medicine = await remindersDb.patchMedicine({
          userId: patientId,
          actorUserId: me.id,
          medicineId: req.params.id,
          patch,
        });
        if (!medicine) {
          notFound(res);
          return;
        }
        res.json({ ok: true, medicine });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.patch(
    "/caregiver/medicines/:id/archive",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "full",
        });

        const medicine = await remindersDb.archiveMedicine({
          userId: patientId,
          actorUserId: me.id,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }
        res.json({ ok: true, medicine });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/caregiver/medicines/:id/schedules",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "view",
        });

        const schedules = await remindersDb.listSchedules({
          userId: patientId,
          medicineId: req.params.id,
        });
        res.json({ ok: true, schedules });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.post(
    "/caregiver/medicines/:id/schedules",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "edit",
        });

        const body = (req as any).body ?? {};
        const schedule = await remindersDb.createSchedule({
          userId: patientId,
          actorUserId: me.id,
          medicineId: req.params.id,
          repeatType: body.repeatType,
          intervalValue: body.intervalValue ?? null,
          selectedDays: body.selectedDays ?? null,
          times: Array.isArray(body.times) ? body.times : [],
          doseByTime: body.doseByTime ?? null,
          startDate: typeof body.startDate === "string" ? body.startDate : "",
          endDate: body.endDate ?? null,
          maxOccurrences: body.maxOccurrences ?? null,
        });
        res.json({ ok: true, schedule });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/caregiver/medicines/:id/upcoming",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "view",
        });

        const medicine = await remindersDb.getMedicine({
          userId: patientId,
          medicineId: req.params.id,
        });
        if (!medicine) {
          notFound(res);
          return;
        }

        const daysAhead = parseBoundedInt(
          getQueryString(req.query?.daysAhead),
          7,
          1,
          31,
        );
        const limit = parseBoundedInt(
          getQueryString(req.query?.limit),
          30,
          1,
          500,
        );
        const untilUtc = DateTime.utc().plus({ days: daysAhead }).toISO();
        if (!untilUtc) {
          badRequest(res, "could not determine date range");
          return;
        }

        const items = await remindersDb.listUpcomingIntakeEventsForMedicine({
          userId: patientId,
          medicineId: req.params.id,
          untilUtc,
          limit,
        });

        res.json({ ok: true, items });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.patch(
    "/caregiver/reminders/intake/:id/taken",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "edit",
        });

        const idem =
          typeof req.header("Idempotency-Key") === "string"
            ? String(req.header("Idempotency-Key"))
            : null;

        const result = await remindersDb.markIntakeEventTaken({
          userId: patientId,
          actorUserId: me.id,
          intakeEventId: req.params.id,
          idempotencyKey: idem,
        });

        res.json({ ok: true, ...result });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.patch(
    "/caregiver/reminders/intake/:id/skipped",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }
        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "edit",
        });

        const body = (req as any).body ?? {};
        const reason = typeof body.reason === "string" ? body.reason : null;

        const event = await remindersDb.markIntakeEventSkipped({
          userId: patientId,
          actorUserId: me.id,
          intakeEventId: req.params.id,
          reason,
        });

        res.json({ ok: true, event });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.post("/caregiver/medicines", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const patientId = getQueryString(req.query?.patientId);
      if (!patientId) {
        badRequest(res, "patientId is required");
        return;
      }
      await remindersDb.requireCaregiverAccessLevel({
        caregiverId: me.id,
        patientId,
        minLevel: "edit",
      });

      const body = (req as any).body ?? {};
      // Caregiver create currently does not accept media keys (they require patient drive uploads).
      const created = await remindersDb.createMedicine({
        userId: patientId,
        actorUserId: me.id,
        name: typeof body.name === "string" ? body.name : "",
        type: body.type,
        dosePerIntake:
          typeof body.dosePerIntake === "number"
            ? body.dosePerIntake
            : Number(body.dosePerIntake),
        doseUnit: typeof body.doseUnit === "string" ? body.doseUnit : null,
        stockTotal: body.stockTotal == null ? null : Number(body.stockTotal),
        stockRemaining:
          body.stockRemaining == null ? null : Number(body.stockRemaining),
        lowStockThreshold:
          body.lowStockThreshold == null
            ? undefined
            : Number(body.lowStockThreshold),
        instructionTag: body.instructionTag,
        note: body.note ?? null,
        photoUrl: null,
        photoKey: null,
        voiceNoteKey: null,
      });

      res.json({ ok: true, medicine: created });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.get(
    "/caregiver/timeline/today",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const patientId = getQueryString(req.query?.patientId);
        const date = getQueryString(req.query?.date);
        if (!patientId) {
          badRequest(res, "patientId is required");
          return;
        }

        await remindersDb.requireCaregiverAccessLevel({
          caregiverId: me.id,
          patientId,
          minLevel: "view",
        });

        let localDate = date;
        if (!localDate) {
          const settings = await remindersDb.getReminderSettings(patientId);
          const nowLocal = DateTime.utc().setZone(settings.timezone);
          localDate = nowLocal.isValid ? (nowLocal.toISODate() ?? "") : "";
        }

        if (!localDate) {
          badRequest(res, "could not determine local date");
          return;
        }

        const items = await remindersDb.getTimelineForLocalDate({
          userId: patientId,
          localDate,
        });

        res.json({ ok: true, items });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );
}
