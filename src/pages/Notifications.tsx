/**
 * Notifications.tsx
 * ----------------------------------------------------------------------------
 * Route: /notifications (protected)
 *
 * Lists the current user's notifications. Clicking an unread item marks it as
 * read in the database and updates the local cache.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notif {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Notif[];
    },
    enabled: !!user,
  });

  /** Mark a single notification as read, then refresh the list. */
  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  }

  return (
    <div className="container py-10 animate-fade-in">
      <header className="mb-8 flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold text-primary">{t("notif.title")}</h1>
      </header>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {!isLoading && items.length === 0 && (
        <Card className="shadow-elegant">
          <CardContent className="p-10 text-center text-muted-foreground">{t("notif.empty")}</CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => !n.is_read && markRead(n.id)}
            className={cn(
              "block w-full rounded-lg border border-border bg-card p-4 text-left transition-all hover:shadow-elegant",
              !n.is_read && "bg-secondary/50 border-accent/30",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                  {n.title}
                </p>
                {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(n.created_at)}
              </time>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Render a relative timestamp like "3 min ago". */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
