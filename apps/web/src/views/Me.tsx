import { useEffect, useState } from "react";
import { Card, CardBody, Badge, Button, Input, SectionTitle, Textarea } from "../ui/components";
import { Link } from "react-router-dom";

type Booking = {
  id: number;
  status: "NEW" | "CONFIRMED" | "CANCELLED" | "DONE";
  slotStart: number;
  slotEnd: number;
  garageId: number;
  garageTitle: string;
  garageAddress: string;
  serviceName: string;
  serviceCategory: string;
  reviewId?: number | null;
  reviewRating?: number | null;
  reviewText?: string | null;
};

type NotificationItem = { id: number; type: string; title: string; text?: string; link?: string; readAt?: number | null; createdAt: number };

const statusText: Record<string, string> = {
  NEW: "Новая",
  CONFIRMED: "Подтверждена",
  CANCELLED: "Отменена",
  DONE: "Выполнена",
};

function roleText(role: string) {
  if (role === "ADMIN") return "Администратор";
  if (role === "MASTER") return "Мастер";
  return "Клиент";
}

export default function Me() {
  const [me, setMe] = useState<any>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, { rating: string; text: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/auth/me");
    const j = await r.json();
    setMe(j.ok ? j.user : null);

    if (j.ok) {
      const nr = await fetch("/api/notifications");
      const nj = await nr.json();
      setNotifications(nj.notifications ?? []);
    } else {
      setNotifications([]);
    }

    if (j.ok && j.user?.role === "USER") {
      const br = await fetch("/api/bookings/my");
      const bj = await br.json();
      const rows = (bj.bookings ?? []) as Booking[];
      setBookings(rows);
      setReviewDrafts((prev) => {
        const next = { ...prev };
        for (const b of rows) {
          if (b.status === "DONE" && !b.reviewId && !next[b.id]) next[b.id] = { rating: "5", text: "" };
        }
        return next;
      });
    } else {
      setBookings([]);
    }
  }

  useEffect(() => { load(); }, []);

  async function markAllRead() {
    await fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    await load();
  }

  async function submitReview(bookingId: number) {
    setMsg(null);
    setErr(null);
    const draft = reviewDrafts[bookingId] ?? { rating: "5", text: "" };
    const r = await fetch(`/api/bookings/${bookingId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: Number(draft.rating || 5), text: draft.text }),
    });
    const j = await r.json();
    if (!j.ok) return setErr(j.error ?? "Не удалось оставить отзыв");
    setMsg("Отзыв сохранён. Рейтинг мастерской обновлён.");
    await load();
  }

  return (
    <div className="space-y-5">
      <SectionTitle eyebrow="Профиль" title="Личный кабинет">
        В профиле отображаются данные аккаунта, записи на ремонт, уведомления и отзывы после выполненных работ.
      </SectionTitle>

      <Card>
        <CardBody className="space-y-4">
          {!me ? (
            <div className="space-y-4">
              <div className="text-sm text-zinc-400">Войди, чтобы увидеть профиль и свои заявки.</div>
              <Link className="inline-flex rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950" to="/auth/login">Войти</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <div className="text-xl font-semibold text-zinc-50">{me.email}</div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{roleText(me.role)}</Badge>
                  <Badge>ID {me.id}</Badge>
                </div>
              </div>
              <Button
                className="bg-zinc-100/10 text-zinc-50 ring-1 ring-zinc-800/60 shadow-none"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  await load();
                }}
              >
                Выйти
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {me && notifications.length > 0 ? (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-semibold text-zinc-50">Уведомления</div>
              <Button className="bg-white/10 text-zinc-50 shadow-none" onClick={markAllRead}>Прочитать всё</Button>
            </div>
            <div className="space-y-2">
              {notifications.slice(0, 8).map((n) => (
                <div key={n.id} className={`rounded-2xl border px-4 py-3 ${n.readAt ? "border-white/10 bg-white/[.04]" : "border-amber-300/25 bg-amber-300/10"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-100">{n.title}</div>
                    <div className="text-xs text-zinc-500">{new Date(n.createdAt).toLocaleString()}</div>
                  </div>
                  {n.text ? <div className="mt-1 text-sm leading-6 text-zinc-400">{n.text}</div> : null}
                  {n.link ? <Link className="mt-2 inline-flex text-xs text-amber-200 underline-offset-4 hover:underline" to={n.link}>Открыть</Link> : null}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {msg ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{msg}</div> : null}
      {err ? <div className="rounded-2xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-200">{err}</div> : null}

      {me?.role === "USER" && (
        <Card>
          <CardBody className="space-y-3">
            <div className="text-lg font-semibold text-zinc-50">Мои заявки</div>
            {bookings.length === 0 ? (
              <div className="text-sm text-zinc-500">Пока заявок нет. Открой карточку гаража и выбери услугу со свободным временем.</div>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => {
                  const draft = reviewDrafts[b.id] ?? { rating: "5", text: "" };
                  return (
                    <div key={b.id} className="rounded-2xl border border-white/10 bg-zinc-950/30 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">#{b.id} • {b.serviceName}</div>
                          <div className="mt-1 text-xs text-zinc-500">{new Date(b.slotStart).toLocaleString()} — {new Date(b.slotEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                          <div className="mt-1 text-xs text-zinc-500">{b.garageTitle} • {b.garageAddress}</div>
                        </div>
                        <Badge>{statusText[b.status] ?? b.status}</Badge>
                      </div>

                      {b.status === "DONE" && b.reviewId ? (
                        <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
                          Отзыв оставлен: {"★".repeat(Number(b.reviewRating ?? 5))} {b.reviewText ? `— ${b.reviewText}` : ""}
                        </div>
                      ) : null}

                      {b.status === "DONE" && !b.reviewId ? (
                        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-white/[.04] p-3">
                          <div className="text-sm font-semibold text-zinc-100">Оставить отзыв</div>
                          <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
                            <Input type="number" min="1" max="5" value={draft.rating} onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [b.id]: { ...draft, rating: e.target.value } }))} />
                            <Textarea value={draft.text} onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [b.id]: { ...draft, text: e.target.value } }))} placeholder="Что понравилось или что стоит улучшить" />
                            <Button type="button" onClick={() => submitReview(b.id)}>Отправить</Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <Link className="text-xs text-amber-200 underline-offset-4 hover:underline" to={`/garage/${b.garageId}`}>Открыть гараж</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {me?.role === "MASTER" && (
        <Card><CardBody><Link className="text-sm text-amber-200 underline-offset-4 hover:underline" to="/master">Перейти в кабинет мастера</Link></CardBody></Card>
      )}
      {me?.role === "ADMIN" && (
        <Card><CardBody><Link className="text-sm text-amber-200 underline-offset-4 hover:underline" to="/admin">Открыть админ-панель</Link></CardBody></Card>
      )}
    </div>
  );
}
