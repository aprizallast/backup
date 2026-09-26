import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isUsernameTaken, reserveUsername } from "@/lib/community-access";

export const Route = createFileRoute("/login")({ component: LoginPage });

type AuthMode = "signup" | "signin";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

function internalEmailFor(username: string): string {
  return `${username.toLowerCase()}@username.agentbrew.invalid`;
}

function LoginPage() {
  const { user, isPending: isCheckingSession } = useCurrentUserState();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isCheckingSession && user) window.location.replace("/?tab=chat");
  }, [isCheckingSession, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const cleanUsername = username.trim();
    if (!USERNAME_PATTERN.test(cleanUsername)) {
      setError("Username must be 3-24 characters and use only letters, numbers, or underscores.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (mode === "signup" && isUsernameTaken(cleanUsername)) {
      setError("That username is already in use. Choose a different one.");
      return;
    }

    setIsSubmitting(true);
    try {
      const credentials = {
        email: internalEmailFor(cleanUsername),
        password,
      };
      const result = mode === "signup"
        ? await authClient.signUp.email({ ...credentials, name: cleanUsername })
        : await authClient.signIn.email(credentials);

      if (result.error) throw new Error(result.error.message || "Authentication failed.");
      if (mode === "signup" && !reserveUsername(cleanUsername)) {
        throw new Error("That username is already in use. Choose a different one.");
      }
      await authClient.getSession();
      window.location.assign("/?tab=chat");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
      setIsSubmitting(false);
    }
  };

  if (isCheckingSession || user) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <p className="text-sm text-[var(--color-muted)]">Checking account...</p>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md border border-[var(--color-line)] bg-[var(--color-surface)] p-5 sm:p-7">
        <a
          href="/?tab=chat"
          className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Room Chat
        </a>

        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--color-line)] text-[var(--color-copper)]">
            <UserRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">
              {mode === "signup" ? "Create a test account" : "Sign in to your account"}
            </h1>
            <p className="text-xs text-[var(--color-muted)]">Username and password only. No email or wallet needed.</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 border border-[var(--color-line)] p-1">
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); }}
            aria-pressed={mode === "signup"}
            className={`h-9 text-sm ${mode === "signup" ? "bg-[var(--color-paper)] text-[var(--color-paper-ink)]" : "text-[var(--color-muted)]"}`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(""); }}
            aria-pressed={mode === "signin"}
            className={`h-9 text-sm ${mode === "signin" ? "bg-[var(--color-paper)] text-[var(--color-paper-ink)]" : "text-[var(--color-muted)]"}`}
          >
            Sign in
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="text-[var(--color-muted)]">Username</span>
            <input
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="field h-11"
              placeholder="e.g. brewtrader"
            />
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="text-[var(--color-muted)]">Password</span>
            <input
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field h-11"
              placeholder="At least 8 characters"
            />
          </label>

          {error && (
            <p role="alert" className="border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-solid flex h-11 w-full items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" />
            {isSubmitting ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
          Test accounts are stored in the application database. No email is sent; an internal address is used only by the sign-in system.
        </p>
      </section>
    </main>
  );
}