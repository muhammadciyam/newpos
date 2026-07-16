import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// Tax rates are actually managed on the working "Tax" tab in Admin > Settings
// (settings.tax — GST %, tax-inclusive pricing, GST label). This page used to be a second,
// disconnected "Taxes" placeholder that never did anything and would have drifted out of
// sync with the real tax settings — redirect straight to the tab that actually works
// instead of maintaining two competing tax UIs.
export const Route = createFileRoute("/admin/taxes")({
  head: () => ({ meta: [{ title: "Taxes — Dhipos" }] }),
  component: TaxesRedirect,
});

function TaxesRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/admin/settings", search: { tab: "Tax" }, replace: true });
  }, [navigate]);
  return null;
}
