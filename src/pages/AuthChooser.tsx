/**
 * AuthChooser.tsx
 * ----------------------------------------------------------------------------
 * Route: /auth
 *
 * Landing screen that lets the visitor pick which portal they want to use
 * before signing in or creating an account:
 *   • Citizen → /auth/citizen   (eligibility, applications, schemes)
 *   • Agent   → /agent/login    (assigned applications dashboard)
 *
 * If a user is already signed in, we route them to the appropriate area
 * automatically so they don't see this chooser again.
 */
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthChooser() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    if (role === "agent") navigate("/agent/dashboard", { replace: true });
    else navigate("/", { replace: true });
  }, [user, navigate]);

  return (
    <div className="container flex min-h-[80vh] flex-col items-center justify-center py-12">
      <div className="mb-10 max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Welcome to WelfareConnect
        </h1>
        <p className="mt-3 text-muted-foreground">
          Choose how you'd like to continue.
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-5 md:grid-cols-2">
        {/* Citizen */}
        <Card className="group relative overflow-hidden transition hover:shadow-elevated">
          <CardHeader className="space-y-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">I'm a Citizen</CardTitle>
            <CardDescription>
              Check eligibility, browse welfare schemes, and apply with help from
              an agent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full tap-target">
              <Link to="/auth/citizen">
                Continue as Citizen
                <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Agent */}
        <Card className="group relative overflow-hidden transition hover:shadow-elevated">
          <CardHeader className="space-y-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">I'm an Agent</CardTitle>
            <CardDescription>
              Sign in to see applications assigned to you, review documents, and
              update statuses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full tap-target">
              <Link to="/agent/login">
                Continue as Agent
                <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Agent accounts are issued by WelfareConnect administrators.
      </p>
    </div>
  );
}
