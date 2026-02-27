import { BrowserRouter, Route, Routes } from "react-router-dom";

import AboutPage from "../pages/AboutPage";
import ContactPage from "../pages/ContactPage";
import EndpointsPage from "../pages/EndpointsPage";
import LandingPage from "../pages/LandingPage";
import InvoicePage from "../pages/InvoicePage";
import OtherDocPage from "../pages/OtherDocPage";
import PrescriptionPage from "../pages/PrescriptionPage";
import ProfilePage from "../pages/ProfilePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/endpoints" element={<EndpointsPage />} />
        <Route path="/prescription" element={<PrescriptionPage />} />
        <Route path="/invoice" element={<InvoicePage />} />
        <Route path="/other-doc" element={<OtherDocPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
