import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardBody, SectionTitle, Textarea } from "../ui/components";

type Garage = {
  id: number;
  title: string;
  address: string;
  description?: string;
  coverUrl?: string;
  avatarUrl?: string;
  masterName: string;
  is_approved: number;
  moderationReason?: string;
  moderatedAt?: number | null;
  servicesList?: string[];
  ratingAvg?: number;
  ratingCount?: number;
  minPrice?: number | null;
  createdAt?: number;
};

type AdminUser = { id: number; role: "ADMIN" | "MASTER" | "USER"; email?: string; phone?: string; displayName?: string; city?: string; avatarUrl?: string; createdAt?: number };
type AdminBooking = { id: number; status: string; cancelReason?: string; masterComment?: string; statusUpdatedAt?: number; slotStart: number; slotEnd: number; createdAt: number; garageId: number; garageTitle: string; serviceName: string; userEmail?: string; userDisplayName?: string; masterName?: string };
type AdminReview = { id: number; rating: number; text?: string; replyText?: string; createdAt: number; garageId: number; garageTitle: string; userEmail?: string; userDisplayName?: string };
type RejectDialog = { id: number; title: string; wasApproved: boolean } | null;
type SupportTicket = { id: number; topic?: string; subject: string; message: string; status: "OPEN" | "IN_PROGRESS" | "CLOSED"; adminReply?: string; createdAt: number; userEmail?: string; userRole?: string; displayName?: string };
type AdminStats = { users?: number; masters?: number; garages?: number; pendingGarages?: number; bookings?: number; doneBookings?: number; reviews?: number; openSupport?: number; avgRating?: number };

type Tab = "stats" | "moderation" | "users" | "bookings" | "reviews" | "support";

const statusText: Record<string, string> = { NEW: "Новая", CONFIRMED: "Подтверждена", IN_PROGRESS: "В работе", CANCELLED: "Отменена", DONE: "Выполнена" };
const roleText: Record<string, string> = { ADMIN: "Админ", MASTER: "Мастер", USER: "Клиент" };

function toMs(value: unknown) {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}
function formatDate(value: unknown) {
  const ms = toMs(value);
  return ms ? new Date(ms).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—";
}
function bookingTime(start: unknown, end: unknown) {
  const s = toMs(start);
  const e = toMs(end);
  if (!s || !e) return "Дата не указана";
  return `${new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })} — ${new Date(e).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}
function statusClass(status: string) {
  if (status === "DONE") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  if (status === "CANCELLED") return "border-red-300/25 bg-red-300/10 text-red-200";
  if (status === "IN_PROGRESS") return "border-violet-300/25 bg-violet-300/10 text-violet-200";
  if (status === "CONFIRMED") return "border-sky-300/25 bg-sky-300/10 text-sky-200";
  return "border-amber-300/25 bg-amber-300/10 text-amber-200";
}

export default function Admin() {
  const [me, setMe] = useState<any>(null);
  const [garages, setGarages] = useState<Garage[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportReplies, setSupportReplies] = useState<Record<number, string>>({});
  const [adminStats, setAdminStats] = useState<AdminStats>({});
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<RejectDialog>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [moderating, setModerating] = useState(false);

  async function load() {
    setErr(null);
    const auth = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({ ok: false }));
    setMe(auth.ok ? auth.user : null);
    if (!auth.ok || auth.user?.role !== "ADMIN") {
      setGarages([]);
      setUsers([]);
      setBookings([]);
      setReviews([]);
      setSupportTickets([]);
      return;
    }

    const [gj, sj, tj, bj, uj, rj] = await Promise.all([
      fetch("/api/admin/garages").then((r) => r.json()).catch(() => ({ ok: false, error: "Не удалось загрузить карточки" })),
      fetch("/api/admin/stats").then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/support").then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/bookings").then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/users").then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/admin/reviews").then((r) => r.json()).catch(() => ({ ok: false })),
    ]);

    if (!gj.ok) setErr(gj.error ?? "Ошибка загрузки");
    setGarages(gj.garages ?? []);
    setAdminStats(sj.stats ?? {});
    setSupportTickets(tj.tickets ?? []);
    setBookings(bj.bookings ?? []);
    setUsers(uj.users ?? []);
    setReviews(rj.reviews ?? []);
    setSupportReplies((prev) => {
      const next = { ...prev };
      for (const t of (tj.tickets ?? []) as SupportTicket[]) if (!next[t.id]) next[t.id] = t.adminReply || "";
      return next;
    });
  }

  useEffect(() => { load(); }, []);

  async function moderate(id: number, approved: 0 | 1, reason = "") {
    setErr(null);
    const j = await fetch(`/api/admin/garages/${id}/moderation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved, reason }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Сервер не ответил" }));
    if (!j.ok) {
      setErr(j.error ?? "Ошибка модерации");
      return false;
    }
    await load();
    return true;
  }

  async function confirmReject() {
    if (!rejecting) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      setErr("Укажи понятную причину отказа: минимум 5 символов.");
      return;
    }
    setModerating(true);
    try {
      const ok = await moderate(rejecting.id, 0, reason);
      if (!ok) return;
      setRejecting(null);
      setRejectReason("");
    } finally {
      setModerating(false);
    }
  }

  function openReject(garage: Garage) {
    setErr(null);
    setRejectReason(garage.moderationReason || "");
    setRejecting({ id: garage.id, title: garage.title, wasApproved: !!garage.is_approved });
  }

  async function updateSupport(id: number, status: "OPEN" | "IN_PROGRESS" | "CLOSED") {
    setErr(null);
    const j = await fetch(`/api/admin/support/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminReply: supportReplies[id] || "" }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Сервер не ответил" }));
    if (!j.ok) return setErr(j.error ?? "Не удалось обновить обращение");
    await load();
  }

  const pending = garages.filter((g) => !g.is_approved && !g.moderationReason);
  const approved = garages.filter((g) => g.is_approved);
  const rejected = garages.filter((g) => !g.is_approved && !!g.moderationReason);
  const activeBookings = bookings.filter((b) => !["DONE", "CANCELLED"].includes(b.status));
  const donePercent = useMemo(() => {
    const total = Number(adminStats.bookings ?? 0);
    return total ? Math.round((Number(adminStats.doneBookings ?? 0) / total) * 100) : 0;
  }, [adminStats.bookings, adminStats.doneBookings]);

  const tabs: Array<[Tab, string]> = [
    ["stats", "Статистика"],
    ["moderation", `Модерация${pending.length ? ` • ${pending.length}` : ""}`],
    ["users", `Пользователи${users.length ? ` • ${users.length}` : ""}`],
    ["bookings", `Заявки${activeBookings.length ? ` • ${activeBookings.length}` : ""}`],
    ["reviews", `Отзывы${reviews.length ? ` • ${reviews.length}` : ""}`],
    ["support", `Поддержка${Number(adminStats.openSupport ?? 0) ? ` • ${adminStats.openSupport}` : ""}`],
  ];

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Администрирование" title="Панель управления">
        Центр управления сервисом: модерация карточек, заявки, пользователи, отзывы и обращения в поддержку.
      </SectionTitle>

      {!me ? (
        <Card><CardBody className="text-sm text-zinc-400">Для доступа требуется вход в аккаунт администратора.</CardBody></Card>
      ) : me.role !== "ADMIN" ? (
        <Card><CardBody className="text-sm text-zinc-400">Для этой страницы нужны права администратора.</CardBody></Card>
      ) : (
        <>
          {err ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{err}</div> : null}

          <div className="flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-white/[.035] p-1">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setActiveTab(key)} className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${activeTab === key ? "bg-amber-400 text-zinc-950" : "text-zinc-300 hover:bg-white/10 hover:text-zinc-50"}`}>{label}</button>
            ))}
          </div>

          {activeTab === "stats" ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat value={adminStats.users ?? 0} label="Пользователей" />
                <Stat value={adminStats.masters ?? 0} label="Мастеров" />
                <Stat value={adminStats.garages ?? 0} label="Гаражей" />
                <Stat value={adminStats.pendingGarages ?? pending.length} label="На модерации" />
                <Stat value={adminStats.bookings ?? 0} label="Заявок всего" />
                <Stat value={adminStats.doneBookings ?? 0} label="Выполнено" />
                <Stat value={adminStats.reviews ?? 0} label="Отзывов" />
                <Stat value={Number(adminStats.avgRating ?? 0).toFixed(1)} label="Средняя оценка" />
              </div>
              <Card><CardBody className="grid gap-3 md:grid-cols-3"><MiniMetric title="Конверсия выполнения" value={`${donePercent}%`} text="Доля заявок со статусом «Выполнена»." /><MiniMetric title="Активные заявки" value={String(activeBookings.length)} text="Новые, подтверждённые и заявки в работе." /><MiniMetric title="Открытая поддержка" value={String(adminStats.openSupport ?? 0)} text="Обращения, которые требуют реакции администратора." /></CardBody></Card>
            </div>
          ) : null}

          {activeTab === "moderation" ? (
            <div className="space-y-5">
              <AdminSection title="Ожидают проверки" empty="Новых карточек на проверку нет.">
                {pending.map((g) => <AdminCard key={g.id} garage={g} onApprove={() => moderate(g.id, 1)} onReject={() => openReject(g)} />)}
              </AdminSection>
              <AdminSection title="Отклонённые карточки" empty="Отклонённых карточек нет.">
                {rejected.map((g) => <AdminCard key={g.id} garage={g} onApprove={() => moderate(g.id, 1)} onReject={() => openReject(g)} />)}
              </AdminSection>
              <AdminSection title="Опубликованные гаражи" empty="Опубликованных карточек пока нет.">
                {approved.map((g) => <AdminCard key={g.id} garage={g} onApprove={() => moderate(g.id, 1)} onReject={() => openReject(g)} />)}
              </AdminSection>
            </div>
          ) : null}

          {activeTab === "users" ? <Card><CardBody className="space-y-3"><div className="text-xl font-semibold text-zinc-50">Пользователи и мастера</div>{users.length === 0 ? <Empty text="Пользователей пока нет." /> : <div className="space-y-2">{users.map((u) => <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-3"><div className="flex items-center gap-3">{u.avatarUrl ? <img src={u.avatarUrl} alt={u.displayName || u.email || "Пользователь"} className="h-10 w-10 rounded-2xl object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-xs font-black text-zinc-300">GM</div>}<div><div className="text-sm font-semibold text-zinc-100">{u.displayName || u.email || `Пользователь #${u.id}`}</div><div className="text-xs text-zinc-500">{u.email || u.phone || "—"} • {u.city || "город не указан"}</div></div></div><Badge>{roleText[u.role] || u.role}</Badge></div>)}</div>}</CardBody></Card> : null}

          {activeTab === "bookings" ? <Card><CardBody className="space-y-3"><div className="text-xl font-semibold text-zinc-50">Все заявки</div>{bookings.length === 0 ? <Empty text="Заявок пока нет." /> : <div className="space-y-2">{bookings.map((b) => <div key={b.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-100">#{b.id} • {b.serviceName}</div><div className="text-xs text-zinc-500">{bookingTime(b.slotStart, b.slotEnd)}</div><div className="text-xs text-zinc-500">{b.garageTitle} • мастер: {b.masterName || "—"} • клиент: {b.userDisplayName || b.userEmail || "—"}</div>{b.cancelReason ? <div className="mt-2 text-xs text-red-200">Причина отмены: {b.cancelReason}</div> : null}</div><Badge className={statusClass(b.status)}>{statusText[b.status] || b.status}</Badge></div></div>)}</div>}</CardBody></Card> : null}

          {activeTab === "reviews" ? <Card><CardBody className="space-y-3"><div className="text-xl font-semibold text-zinc-50">Отзывы</div>{reviews.length === 0 ? <Empty text="Отзывов пока нет." /> : <div className="space-y-2">{reviews.map((r) => <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-100">{r.garageTitle}</div><div className="text-xs text-zinc-500">{r.userDisplayName || r.userEmail || "Клиент"} • {formatDate(r.createdAt)}</div></div><Badge>{"★".repeat(Number(r.rating))}</Badge></div>{r.text ? <div className="mt-2 text-sm leading-6 text-zinc-400">{r.text}</div> : null}{r.replyText ? <div className="mt-2 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-3 text-sm text-amber-100">Ответ мастера: {r.replyText}</div> : null}</div>)}</div>}</CardBody></Card> : null}

          {activeTab === "support" ? <Card><CardBody className="space-y-3"><div className="text-xl font-semibold text-zinc-50">Обращения в поддержку</div>{supportTickets.length === 0 ? <Empty text="Обращений пока нет." /> : <div className="space-y-3">{supportTickets.map((t) => (<div key={t.id} className="rounded-3xl border border-white/10 bg-white/[.04] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-zinc-50">#{t.id} • {t.subject}</div><div className="mt-1 text-xs text-zinc-500">{t.topic || "Другое"} • {t.displayName || t.userEmail || "Пользователь"} • {t.userRole || ""}</div></div><Badge className={t.status === "CLOSED" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : t.status === "IN_PROGRESS" ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : ""}>{t.status === "OPEN" ? "Новое" : t.status === "IN_PROGRESS" ? "В работе" : "Закрыто"}</Badge></div><div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-zinc-300">{t.message}</div><label className="mt-3 block space-y-2 text-xs text-zinc-400">Ответ администратора<Textarea value={supportReplies[t.id] || ""} onChange={(e) => setSupportReplies((p) => ({ ...p, [t.id]: e.target.value }))} /></label><div className="mt-3 flex flex-wrap gap-2"><Button className="bg-white/10 text-zinc-50 shadow-none" onClick={() => updateSupport(t.id, "IN_PROGRESS")}>В работу</Button><Button onClick={() => updateSupport(t.id, "CLOSED")}>Закрыть с ответом</Button></div></div>))}</div>}</CardBody></Card> : null}
        </>
      )}

      {rejecting ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl">
            <CardBody className="space-y-4">
              <div>
                <div className="text-xl font-semibold text-zinc-50">{rejecting.wasApproved ? "Снять гараж с публикации" : "Отклонить карточку"}</div>
                <div className="mt-1 text-sm text-zinc-500">{rejecting.title}</div>
              </div>
              <label className="block space-y-2 text-xs text-zinc-400">Причина для мастера<Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Например: добавьте реальные фото гаража, уточните адрес и номер телефона." /></label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={confirmReject} disabled={moderating}>{moderating ? "Сохраняю..." : "Сохранить причину"}</Button>
                <Button className="bg-white/10 text-zinc-50 shadow-none" onClick={() => { setRejecting(null); setRejectReason(""); }} disabled={moderating}>Отмена</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[.04] p-4"><div className="text-3xl font-black text-zinc-50">{value}</div><div className="mt-1 text-xs text-zinc-500">{label}</div></div>;
}
function MiniMetric({ title, value, text }: { title: string; value: string; text: string }) {
  return <div className="rounded-3xl border border-white/10 bg-black/20 p-4"><div className="text-sm text-zinc-500">{title}</div><div className="mt-2 text-3xl font-black text-amber-200">{value}</div><div className="mt-2 text-xs leading-5 text-zinc-500">{text}</div></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm text-zinc-500">{text}</div>;
}
function AdminSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return <div className="space-y-3"><div className="text-xl font-semibold text-zinc-50">{title}</div>{items.length === 0 ? <Card><CardBody><Empty text={empty} /></CardBody></Card> : <div className="grid gap-4 md:grid-cols-2">{items}</div>}</div>;
}

function AdminCard({ garage, onApprove, onReject }: { garage: Garage; onApprove: () => void; onReject: () => void }) {
  const rejected = !garage.is_approved && !!garage.moderationReason;
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[190px_1fr]">
        <img src={garage.coverUrl || "/images/garage-lada-real.jpg"} alt={garage.title} className="h-full min-h-56 w-full object-cover" />
        <CardBody className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-zinc-50">{garage.title}</div>
              <div className="text-xs text-zinc-500">{garage.address}</div>
            </div>
            <Badge className={garage.is_approved ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : rejected ? "border-red-300/25 bg-red-300/10 text-red-200" : "border-amber-300/25 bg-amber-300/10 text-amber-200"}>{garage.is_approved ? "Опубликован" : rejected ? "Отклонён" : "На проверке"}</Badge>
          </div>
          <div className="flex items-center gap-2"><img src={garage.avatarUrl || "/images/master-ivan.jpg"} alt={garage.masterName} className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/10" /><div className="text-sm text-zinc-300">{garage.masterName}</div></div>
          <div className="text-sm leading-6 text-zinc-400 line-clamp-3">{garage.description}</div>
          {garage.moderationReason ? <div className="rounded-2xl border border-red-400/15 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-100"><span className="font-semibold">Причина:</span> {garage.moderationReason}</div> : null}
          <div className="flex flex-wrap gap-2">{(garage.servicesList ?? []).slice(0, 4).map((s) => <Badge key={s}>{s}</Badge>)}</div>
          <div className="flex flex-wrap gap-2 pt-1"><Button onClick={onApprove} disabled={!!garage.is_approved}>Опубликовать</Button><Button className="bg-white/10 text-zinc-50 shadow-none" onClick={onReject}>{garage.is_approved ? "Снять с публикации" : "Отклонить"}</Button><Link to={`/garage/${garage.id}`} className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2 text-sm font-semibold text-zinc-100">Открыть</Link></div>
        </CardBody>
      </div>
    </Card>
  );
}
