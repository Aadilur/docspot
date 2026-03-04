# DocSpot.App — 2–3 minute video demo pitch (script + storyboard)

Audience: early users + investors
Length target: ~2:55 (trim notes included)

## Pre-record setup (30–60s prep)

- Have a test account with at least:
  - 1 prescription group with 2 reports and 1–2 attachments
  - 1 invoice/document group with an attachment
  - 1 “Other doc / object” group with an attachment
  - 1 medicine reminder with a schedule + at least a couple of past intake events
- Use a clean browser profile (or incognito) and be ready to sign in.
- Optional: prepare one “Roadmap” slide (single screen) listing upcoming features.

---

## Script + storyboard (read this while performing the actions)

> Tip: keep your cursor visible and move slowly. The voiceover is written to match the actions.

|      Time | Page (route)                                             | On-screen action                                                                                  | What you say (voiceover)                                                                                                                                                                                                                                                                                                                                                              |
| --------: | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | `/`                                                      | Start on landing. Pause on headline/brand.                                                        | “Hi, I’m building **DocSpot.App** — a privacy-first SaaS to store a family’s health records and important documents, and share them only when you choose. Our vision is to become the **secure hub** for family health — prescriptions, documents, reminders, and caregiver support — all connected. And we’re already working on a **mobile app** so this stays with you every day.” |
| 0:15–0:30 | `/`                                                      | Click **Login** (Google sign-in).                                                                 | “Our principle is simple: **nothing is public by default**. Everything stays secured behind sign-in, and sharing is always an explicit action.”                                                                                                                                                                                                                                       |
| 0:30–1:10 | `/prescription` → `/prescription/:groupId`               | Open Prescription groups. Open a group and a report. Scroll attachments + notes.                  | “First: **prescriptions**. I keep one group per disease or condition, then add reports over time — which doctor I saw, what they prescribed, and the attachments. It becomes a clean track record that’s easy to search and review.”                                                                                                                                                  |
| 1:10–1:25 | `/prescription/:groupId` → `/share/prescriptions/:token` | Trigger **Share** (generate link) and open the shared view.                                       | “When I need to share, I generate a **secure share link** that can expire. The viewer sees a focused shared view — and I’m not exposing the whole account.”                                                                                                                                                                                                                           |
| 1:25–1:40 | `/invoice` + `/other-doc`                                | Quick montage: open a document group, then an object-tracking group; show attachments.            | “Second: **documents** — invoices, reports, files — and third: **object tracking** for things like warranties or important records. Same idea: organized storage and controlled sharing.”                                                                                                                                                                                             |
| 1:40–2:25 | `/reminder` → `/reminder/medicines/:id`                  | Open Today timeline. Mark one due dose as Taken. Open a medicine to show schedule + past history. | “Next: **medicine reminders**. Today’s timeline shows doses that are due, and the patient can mark them taken or skipped. The app keeps a clean history — and future doses can’t be marked early — so caregivers and doctors can trust what they see.”                                                                                                                                |
| 2:25–2:40 | `/reminder/caregiver`                                    | Show caregiver/advisor flow (invite or list). Mention permissions.                                | “We also support an **advisor/caregiver** model with **view**, **edit**, and **full** permissions — so family support is safe and controlled.”                                                                                                                                                                                                                                        |
| 2:40–3:00 | (Optional quick slide)                                   | Show a single roadmap slide, then end on `/` (brand).                                             | “What’s next: AI help extracting medicine lists from handwritten prescriptions, **paid document viewing** where viewers pay the owner to access, and doctor appointment workflows with hospital/doctor panels — starting local and scaling globally if validated. We’re launching this MVP now and exploring investment to accelerate growth.”                                        |

### Trim to keep it under 3 minutes

If you need to cut to ~2:30:

- Skip opening the shared link (just show the share action).
- Or keep `/invoice` + `/other-doc` as one sentence without switching pages.

---

## One-line value prop (for the video description)

DocSpot.App is a privacy-first SaaS (mobile app in progress) for families to store prescriptions and documents, track health history over time, and share securely — plus medicine reminders with caregiver permissions.
