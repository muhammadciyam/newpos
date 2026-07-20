import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BookText, MessageCircle, Smartphone } from "lucide-react";
import { authStore, useCurrentUser } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { useOutlets } from "@/lib/outlets-store";

// Same support number as the app-sidebar's "Chat on Viber" link. Kept as one constant here
// since the forgot-password contact links below all point at it.
const SUPPORT_PHONE = "+9607799190";
const SUPPORT_MESSAGE = "Hi, I forgot my Dhipos password. Can you help me reset it?";

function buildWhatsAppLink(phone: string, message: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

function buildViberLink(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `viber://chat?number=%2B${digitsOnly}`;
}

function buildSmsLink(phone: string, message: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `sms:${digitsOnly}?body=${encodeURIComponent(message)}`;
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Log In - Dhipos" }],
  }),
  component: LoginPage,
});

const errorMessages: Record<string, string> = {
  invalid: "Incorrect email/username or password",
  suspended: "Your account has been suspended. Contact an admin.",
  inactive: "Your account is inactive. Contact an admin.",
};

function LoginPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const outlets = useOutlets();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [outletName, setOutletName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void authStore.hydrate();
    if (authStore.getCurrentUser()) {
      navigate({ to: "/" });
    }
  }, [navigate]);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const matchedOutlet = outlets.find(
      (o) => o.name.trim().toLowerCase() === outletName.trim().toLowerCase(),
    );
    // Only enforce matching an existing outlet once outlets have actually been set up
    // (Admin > Locations / Super Admin). With none configured yet there's nothing valid
    // to match against, so requiring one would just lock everyone out of logging in.
    if (!matchedOutlet && outlets.length > 0) {
      setError(`Outlet "${outletName.trim()}" not found — check the name and try again.`);
      return;
    }
    setSubmitting(true);
    const result = await authStore.login(identifier, password, matchedOutlet?.id ?? null);
    setSubmitting(false);
    if (!result.ok) {
      if (result.reason === "network") {
        setError(result.message);
      } else if (result.reason === "outlet-mismatch") {
        const expectedName = outlets.find((o) => o.id === result.expectedOutletId)?.name;
        setError(
          expectedName
            ? `This account is assigned to outlet "${expectedName}" — enter that outlet name to log in.`
            : "This account is assigned to a different outlet — check the outlet name and try again.",
        );
      } else {
        setError(errorMessages[result.reason]);
      }
      return;
    }
    logAudit(
      result.user.name,
      "login",
      `Session (Outlet: ${matchedOutlet?.name ?? outletName.trim()})`,
    );
    navigate({ to: "/" });
  }

  const [forgotOpen, setForgotOpen] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookText className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold text-foreground">Dhipos</p>
          <p className="text-sm text-muted-foreground">Log in to your account</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Outlet Name</Label>
            <Input
              value={outletName}
              onChange={(e) => setOutletName(e.target.value)}
              placeholder="e.g. Seven Mart"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email or Username</Label>
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            Log In
          </Button>
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="w-full text-center text-sm text-muted-foreground hover:underline"
          >
            Forgot password?
          </button>
        </form>
      </Card>
      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  );
}

// Email-based reset (requestPasswordResetOnServer) needs Resend configured (RESEND_API_KEY /
// RESEND_FROM_EMAIL in .env) to actually deliver anything — this shop hasn't set that up, so
// rather than a dialog that always claims success while silently never sending an email, this
// points staff straight at direct contact with support (WhatsApp/Viber/SMS) — same as an
// Admin/Super Admin resetting it for them from Admin > Users.
function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Forgot your password?</DialogTitle>
          <DialogDescription>
            Message us on WhatsApp, Viber, or SMS at {SUPPORT_PHONE} and we'll reset it for you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <a
            href={buildWhatsAppLink(SUPPORT_PHONE, SUPPORT_MESSAGE)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-left transition hover:bg-accent"
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="flex-1 text-sm font-medium text-emerald-600">WhatsApp {SUPPORT_PHONE}</p>
          </a>
          <a
            href={buildViberLink(SUPPORT_PHONE)}
            className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-left transition hover:bg-accent"
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="flex-1 text-sm font-medium text-purple-600">Viber {SUPPORT_PHONE}</p>
          </a>
          <a
            href={buildSmsLink(SUPPORT_PHONE, SUPPORT_MESSAGE)}
            className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-left transition hover:bg-accent"
          >
            <Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="flex-1 text-sm font-medium text-blue-600">SMS {SUPPORT_PHONE}</p>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
