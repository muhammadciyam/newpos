import { createFileRoute } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/ecommerce")({
  head: () => ({ meta: [{ title: "Ecommerce — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Ecommerce"
      description="Manage your online store orders and catalogue sync."
      icon={ShoppingCart}
      empty="Ecommerce is not connected yet."
    />
  ),
});
