import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "./cn";

type CurrentUser = {
  id: number;
  role: "USER" | "MASTER" | "ADMIN";
  email: string;
} | null;

type NotificationItem = { id: number; title: string; text?: string; link?: string; readAt?: number | null; createdAt: number };

function roleLabel(role?: string) {
  if (role === "ADMIN") return "Админ";
  if (role === "MASTER") return "Мастер";
  return "Клиент";
}

export default function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const [me, setMe] = useState<CurrentUser>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    try {
      const r = await fetch("/api/auth/me");
      const j = await r.json();
      const user = j.ok ? j.user : null;
      setMe(user);
      if (user) {
        const nr = await fetch("/api/notifications");
        const nj = await nr.json();
        setUnreadCount(Number(nj.unreadCount ?? 0));
        setNotifications(nj.notifications ?? []);
      } else {
        setUnreadCount(0);
        setNotifications([]);
      }
    } catch {
      setMe(null);
      setUnreadCount(0);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    setUnreadCount(0);
    setNotifications([]);
    navigate("/auth/login");
  }

  async function markAllNotificationsRead() {
    await fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setShowNotifications(false);
    await loadMe();
  }

  useEffect(() => { loadMe(); setShowNotifications(false); }, [loc.pathname]);

  const nav = [
    { to: "/", label: "Главная", show: true },
    { to: "/feed", label: "Лента", show: true },
    { to: "/search", label: "Каталог", show: true },
    { to: "/favorites", label: "Избранное", show: true },
    { to: "/me", label: "Профиль", show: !!me },
    { to: "/support", label: "Поддержка", show: !!me },
    { to: "/master", label: "Кабинет", show: me?.role === "MASTER" || me?.role === "ADMIN" },
    { to: "/admin", label: "Админка", show: me?.role === "ADMIN" },
  ].filter((item) => item.show);

  const bottomNav = useMemo(() => {
    const items = [
      { to: "/", label: "Главная", icon: "⌂", show: true },
      { to: "/search", label: "Каталог", icon: "⌕", show: true },
      { to: "/favorites", label: "Избранное", icon: "★", show: true },
      { to: me ? "/me" : "/auth/login", label: me ? "Профиль" : "Войти", icon: unreadCount > 0 ? String(Math.min(unreadCount, 9)) : "●", show: true },
      { to: "/support", label: "Поддержка", icon: "?", show: !!me && me?.role !== "ADMIN" },
      { to: "/master", label: "Мастер", icon: "⚙", show: me?.role === "MASTER" },
      { to: "/admin", label: "Админ", icon: "✓", show: me?.role === "ADMIN" },
    ];
    return items.filter((item) => item.show);
  }, [me, unreadCount]);

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/82 backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400 text-base font-black text-zinc-950 shadow-[0_14px_45px_rgba(251,191,36,0.25)]">
              GM
            </div>
            <div className="hidden min-w-0 leading-tight sm:block">
              <div className="truncate text-sm font-black uppercase tracking-[0.22em] text-zinc-50">GarageMaster</div>
              <div className="truncate text-xs text-zinc-500">частные автомастерские Ульяновска</div>
            </div>
          </Link>

          <nav className="hidden min-w-0 justify-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[.035] p-1 lg:flex">
            {nav.map((n) => {
              const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-zinc-50",
                    active && "bg-amber-400 text-zinc-950 shadow-[0_10px_28px_rgba(251,191,36,0.2)] hover:bg-amber-300 hover:text-zinc-950"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-2">
            {!loading && me ? (
              <>
                <div className="relative hidden sm:block">
                  <button
                    type="button"
                    onClick={() => setShowNotifications((v) => !v)}
                    className="relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.055] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-amber-300/35 hover:text-amber-100"
                    title={me.email}
                  >
                    🔔 {roleLabel(me.role)}
                    {unreadCount > 0 ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-zinc-950">{Math.min(unreadCount, 99)}</span> : null}
                  </button>
                  {showNotifications ? (
                    <div className="absolute right-0 top-12 z-[90] w-80 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/98 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                        <div className="text-sm font-semibold text-zinc-50">Уведомления</div>
                        <button type="button" onClick={markAllNotificationsRead} className="text-xs text-amber-200 hover:underline">Прочитать все</button>
                      </div>
                      <div className="max-h-96 overflow-y-auto p-2">
                        {notifications.length === 0 ? <div className="p-4 text-sm text-zinc-500">Уведомлений пока нет.</div> : notifications.slice(0, 8).map((n) => (
                          <Link key={n.id} to={n.link || "/me"} className={`block rounded-2xl px-3 py-3 transition hover:bg-white/[.06] ${!n.readAt ? "bg-amber-300/10" : ""}`}>
                            <div className="text-sm font-semibold text-zinc-100">{n.title}</div>
                            {n.text ? <div className="mt-1 text-xs leading-5 text-zinc-500">{n.text}</div> : null}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full border border-white/10 bg-white/[.055] px-3 py-2 text-sm font-medium text-zinc-100 transition hover:border-red-300/30 hover:bg-red-300/10 hover:text-red-100"
                >
                  Выйти
                </button>
              </>
            ) : (
              <Link
                to="/auth/login"
                className="rounded-full border border-white/10 bg-white/[.055] px-3 py-2 text-sm font-medium text-zinc-100 transition hover:border-amber-300/35 hover:text-amber-100"
              >
                Войти
              </Link>
            )}
            <Link
              to="/search"
              className="hidden rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-[0_12px_34px_rgba(251,191,36,0.18)] transition hover:-translate-y-0.5 hover:bg-amber-300 xl:inline-flex"
            >
              Найти мастера
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mt-10 border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
          <div>GarageMaster</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <span>Каталог частных автомастерских и гаражных мастеров в г. Ульяновск</span>
            <Link className="text-zinc-400 underline-offset-4 hover:text-amber-200 hover:underline" to="/privacy">Персональные данные</Link>
            {me ? <Link className="text-zinc-400 underline-offset-4 hover:text-amber-200 hover:underline" to="/support">Поддержка</Link> : null}
          </div>
        </div>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/10 bg-zinc-950/90 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg gap-1" style={{ gridTemplateColumns: `repeat(${bottomNav.length}, minmax(0, 1fr))` }}>
          {bottomNav.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <Link
                key={`${n.to}-${n.label}`}
                to={n.to}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center rounded-2xl px-2 text-[11px] text-zinc-400 transition",
                  active && "bg-amber-300/10 text-amber-100 ring-1 ring-amber-300/20"
                )}
              >
                <span className={cn("grid h-5 min-w-5 place-items-center rounded-full text-lg leading-none", n.to === "/me" && unreadCount > 0 && "bg-amber-400 px-1 text-[10px] font-black text-zinc-950")}>{n.icon}</span>
                <span className="mt-1 max-w-full truncate">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
