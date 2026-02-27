import { BrowserRouter, Route, Routes } from "react-router-dom";

import AboutPage from "../pages/AboutPage";
import ContactPage from "../pages/ContactPage";
import LandingPage from "../pages/LandingPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
