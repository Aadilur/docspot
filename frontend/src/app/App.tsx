import { BrowserRouter, Route, Routes } from "react-router-dom";

import AboutPage from "../pages/AboutPage";
import ContactPage from "../pages/ContactPage";
import EndpointsPage from "../pages/EndpointsPage";
import LandingPage from "../pages/LandingPage";
import InvoicePage from "../pages/InvoicePage";
import InvoiceGroupDetailsPage from "../pages/InvoiceGroupDetailsPage";
import SharedInvoiceGroupPage from "../pages/SharedInvoiceGroupPage";
import OtherDocPage from "../pages/OtherDocPage";
import ObjectGroupDetailsPage from "../pages/ObjectGroupDetailsPage";
import SharedObjectGroupPage from "../pages/SharedObjectGroupPage";
import PrescriptionGroupsPage from "../pages/PrescriptionGroupsPage";
import PrescriptionGroupDetailsPage from "../pages/PrescriptionGroupDetailsPage";
import SharedPrescriptionGroupPage from "../pages/SharedPrescriptionGroupPage";
import PrivacyPolicyPage from "../pages/PrivacyPolicyPage";
import ProfilePage from "../pages/ProfilePage";
import RefundPolicyPage from "../pages/RefundPolicyPage";
import TermsPage from "../pages/TermsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/terms-and-conditions" element={<TermsPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/endpoints" element={<EndpointsPage />} />
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
        <Route path="/invoice/:groupId" element={<InvoiceGroupDetailsPage />} />
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
    </BrowserRouter>
  );
}
