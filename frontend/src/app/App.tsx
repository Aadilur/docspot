import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import LandingPage from "../pages/LandingPage";

const AboutPage = lazy(() => import("../pages/AboutPage"));
const ContactPage = lazy(() => import("../pages/ContactPage"));
const PricingPage = lazy(() => import("../pages/PricingPage"));
const TermsPage = lazy(() => import("../pages/TermsPage"));
const PrivacyPolicyPage = lazy(() => import("../pages/PrivacyPolicyPage"));
const RefundPolicyPage = lazy(() => import("../pages/RefundPolicyPage"));
const ProfilePage = lazy(() => import("../pages/ProfilePage"));
const EndpointsPage = lazy(() => import("../pages/EndpointsPage"));

const ReminderPage = lazy(() => import("../pages/ReminderPage"));
const ReminderAddWizardPage = lazy(
  () => import("../pages/ReminderAddWizardPage"),
);
const ReminderCaregiverPage = lazy(
  () => import("../pages/ReminderCaregiverPage"),
);
const ReminderMedicinesPage = lazy(
  () => import("../pages/ReminderMedicinesPage"),
);
const ReminderMedicineDetailsPage = lazy(
  () => import("../pages/ReminderMedicineDetailsPage"),
);

const PrescriptionGroupsPage = lazy(
  () => import("../pages/PrescriptionGroupsPage"),
);
const PrescriptionGroupDetailsPage = lazy(
  () => import("../pages/PrescriptionGroupDetailsPage"),
);
const SharedPrescriptionGroupPage = lazy(
  () => import("../pages/SharedPrescriptionGroupPage"),
);

const InvoicePage = lazy(() => import("../pages/InvoicePage"));
const InvoiceGroupDetailsPage = lazy(
  () => import("../pages/InvoiceGroupDetailsPage"),
);
const SharedInvoiceGroupPage = lazy(
  () => import("../pages/SharedInvoiceGroupPage"),
);

const OtherDocPage = lazy(() => import("../pages/OtherDocPage"));
const ObjectGroupDetailsPage = lazy(
  () => import("../pages/ObjectGroupDetailsPage"),
);
const SharedObjectGroupPage = lazy(
  () => import("../pages/SharedObjectGroupPage"),
);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-5xl px-5 py-10 text-sm text-zinc-600 dark:text-zinc-300">
            Loading…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/terms-and-conditions" element={<TermsPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/refund-policy" element={<RefundPolicyPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/endpoints" element={<EndpointsPage />} />
          <Route path="/reminder" element={<ReminderPage />} />
          <Route path="/reminder/add" element={<ReminderAddWizardPage />} />
          <Route
            path="/reminder/caregiver"
            element={<ReminderCaregiverPage />}
          />
          <Route
            path="/reminder/medicines"
            element={<ReminderMedicinesPage />}
          />
          <Route
            path="/reminder/medicines/:id"
            element={<ReminderMedicineDetailsPage />}
          />
          <Route path="/prescription" element={<PrescriptionGroupsPage />} />
          <Route
            path="/prescription/:groupId"
            element={<PrescriptionGroupDetailsPage />}
          />
          <Route
            path="/share/prescriptions/:token"
            element={<SharedPrescriptionGroupPage />}
          />
          <Route path="/invoice" element={<InvoicePage />} />
          <Route
            path="/invoice/:groupId"
            element={<InvoiceGroupDetailsPage />}
          />
          <Route
            path="/share/invoices/:token"
            element={<SharedInvoiceGroupPage />}
          />
          <Route path="/other-doc" element={<OtherDocPage />} />
          <Route
            path="/other-doc/:groupId"
            element={<ObjectGroupDetailsPage />}
          />
          <Route
            path="/share/objects/:token"
            element={<SharedObjectGroupPage />}
          />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
