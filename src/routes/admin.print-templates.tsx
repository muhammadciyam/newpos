import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/admin/print-templates")({
  head: () => ({ meta: [{ title: "Print Templates — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Print Templates"
      description="Customize the layout of bills, quotations and receipts."
      icon={Printer}
      empty="Using default print templates."
    />
  ),
});
