import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { BookText } from "lucide-react";
import { resetPasswordOnServer } from "@/lib/password-reset-api";

const validateSearch = (search: Record<string, unknown>): { token?: string } => ({
  token: typeof search.token === "string" ? search.token : undefined,
});

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset Password - Dhipos" }],
  }),
  validateSearch,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("This reset link is missing its token — request a new one from the login page.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const result: { ok: true } | { error: string } = await resetPasswordOnServer({
        data: { token, newPassword: password },
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookText className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold text-foreground">Dhipos</p>
          <p className="text-sm text-muted-foreground">Set a new password</p>
        </div>
        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">
              Your password has been reset. You can now log in with your new password.
            </p>
            <Link to="/login">
              <Button className="w-full" size="lg">
                Go to Log In
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              Reset Password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
