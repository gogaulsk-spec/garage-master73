import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
  reviewCreatedAt?: number | null;
};

type NotificationItem = { id: number; type: string; title: string; text?: string; link?: string; readAt?: number | null; createdAt: number };
type Profile = { id?: number; role?: string; email?: string; phone?: string; displayName?: string; about?: string; avatarUrl?: string; city?: string; carInfo?: string; updatedAt?: number };
type MyReview = { id: number; rating: number; text?: string; createdAt: number; bookingId: number; garageId: number; garageTitle: string; serviceName: string };
type PendingReview = { bookingId: number; slotStart: number; slotEnd: number; garageId: number; garageTitle: string; serviceName: string };

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

function initials(value?: string) {
  const clean = (value || "GM").trim();
  return clean.slice(0, 2).toUpperCase();
}

function toMs(value: unknown) {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: unknown) {
  const ms = toMs(value);
  return ms ? new Date(ms).toLocaleDateString("ru-RU") : "Дата не указана";
}

function formatDateTime(value: unknown) {
  const ms = toMs(value);
  return ms ? new Date(ms).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "Дата не указана";
}

function formatBookingRange(startValue: unknown, endValue: unknown) {
  const start = toMs(startValue);
  const end = toMs(endValue);
  if (!start || !end) return "Дата не указана";
  return `${new Date(start).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })} — ${new Date(end).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function resizeAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Выбери изображение для аватарки."));
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Аватарка должна быть не больше 5 МБ."));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Не удалось обработать изображение."));
      image.onload = () => {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Браузер не смог подготовить аватарку."));
        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;
        ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function Me() {
  const [me, setMe] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileDraft, setProfileDraft] = useState({ displayName: "", about: "", avatarUrl: "", city: "", carInfo: "", phone: "" });
  const [activeTab, setActiveTab] = useState<"profile" | "bookings" | "reviews">("profile");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [myReviews, setMyReviews] = useState<MyReview[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, { rating: string; text: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  async function load() {
    const r = await fetch("/api/auth/me");
    const j = await r.json().catch(() => ({ ok: false }));
    const user = j.ok ? j.user : null;
    setMe(user);

    if (user) {
      const [pr, nr] = await Promise.all([fetch("/api/profile"), fetch("/api/notifications")]);
      const [pj, nj] = await Promise.all([pr.json().catch(() => ({ ok: false })), nr.json().catch(() => ({ ok: false }))]);
      const nextProfile = pj.ok ? pj.profile : user;
      setProfile(nextProfile);
      setProfileDraft({
        displayName: nextProfile?.displayName || "",
        about: nextProfile?.about || "",
        avatarUrl: nextProfile?.avatarUrl || "",
        city: nextProfile?.city || "",
        carInfo: nextProfile?.carInfo || "",
        phone: nextProfile?.phone || "",
      });
      setNotifications(nj.notifications ?? []);
    } else {
      setProfile(null);
      setNotifications([]);
    }

    if (user?.role === "USER") {
      const [br, rr] = await Promise.all([fetch("/api/bookings/my"), fetch("/api/reviews/my")]);
      const [bj, rj] = await Promise.all([br.json().catch(() => ({ ok: false })), rr.json().catch(() => ({ ok: false }))]);
      const rows = (bj.bookings ?? []) as Booking[];
      setBookings(rows);
      setPendingReviews(rj.pending ?? []);
      setMyReviews(rj.reviews ?? []);
      setReviewDrafts((prev) => {
        const next = { ...prev };
        for (const b of rows) {
          if (b.status === "DONE" && !b.reviewId && !next[b.id]) next[b.id] = { rating: "5", text: "" };
        }
        for (const p of (rj.pending ?? []) as PendingReview[]) {
          if (!next[p.bookingId]) next[p.bookingId] = { rating: "5", text: "" };
        }
        return next;
      });
    } else {
      setBookings([]);
      setPendingReviews([]);
      setMyReviews([]);
    }
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    bookings: bookings.length,
    done: bookings.filter((b) => b.status === "DONE").length,
    reviews: myReviews.length,
    pendingReviews: pendingReviews.length,
  }), [bookings, myReviews, pendingReviews]);

  async function markAllRead() {
    await fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    await load();
  }

  async function handleAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setMsg(null);
    setAvatarLoading(true);
    try {
      const avatarUrl = await resizeAvatarFile(file);
      setProfileDraft((prev) => ({ ...prev, avatarUrl }));
      setMsg("Аватарка добавлена в форму. Нажми «Сохранить профиль», чтобы применить.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Не удалось загрузить аватарку");
    } finally {
      setAvatarLoading(false);
    }
  }

  async function saveProfile() {
    setErr(null);
    setMsg(null);
    setSavingProfile(true);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileDraft),
      });
      const j = await r.json().catch(() => ({ ok: false, error: "Сервер не ответил" }));
      if (!j.ok) return setErr(j.error ?? "Не удалось сохранить профиль");
      setMsg("Профиль сохранён.");
      await load();
    } finally {
      setSavingProfile(false);
    }
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
    const j = await r.json().catch(() => ({ ok: false, error: "Сервер не ответил" }));
    if (!j.ok) return setErr(j.error ?? "Не удалось оставить отзыв");
    setMsg("Отзыв сохранён. Рейтинг мастерской обновлён.");
    setActiveTab("reviews");
    await load();
  }

  function setReviewDraft(bookingId: number, patch: Partial<{ rating: string; text: string }>) {
    setReviewDrafts((prev) => ({ ...prev, [bookingId]: { ...(prev[bookingId] ?? { rating: "5", text: "" }), ...patch } }));
  }

  return (
    <div className="space-y-5">
      <SectionTitle eyebrow="Профиль" title="Личный кабинет">
        Здесь хранятся данные аккаунта, заявки, уведомления и отдельная вкладка отзывов после выполненных работ.
      </SectionTitle>

      <Card>
        <CardBody className="space-y-4">
          {!me ? (
            <div className="space-y-4">
              <div className="text-sm text-zinc-400">Войди, чтобы увидеть профиль и свои заявки.</div>
              <Link className="inline-flex rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950" to="/auth/login">Войти</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                {profileDraft.avatarUrl ? (
                  <img src={profileDraft.avatarUrl} alt="Аватар" className="h-20 w-20 rounded-3xl object-cover ring-1 ring-white/10" />
                ) : (
                  <div className="grid h-20 w-20 place-items-center rounded-3xl bg-amber-400 text-2xl font-black text-zinc-950">{initials(profileDraft.displayName || me.email)}</div>
                )}
                <div className="space-y-2">
                  <div className="text-xl font-semibold text-zinc-50">{profileDraft.displayName || me.email}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{roleText(me.role)}</Badge>
                    <Badge>{me.email}</Badge>
                    {profileDraft.city ? <Badge>{profileDraft.city}</Badge> : null}
                    {stats.pendingReviews > 0 ? <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-200">Отзывов к заполнению: {stats.pendingReviews}</Badge> : null}
                  </div>
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

      {me ? (
        <div className="grid gap-2 rounded-3xl border border-white/10 bg-white/[.035] p-1 sm:grid-cols-3">
          {[
            ["profile", "Профиль"],
            ["bookings", `Заявки${stats.bookings ? ` • ${stats.bookings}` : ""}`],
            ["reviews", `Отзывы${stats.pendingReviews ? ` • ${stats.pendingReviews}` : ""}`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as any)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${activeTab === key ? "bg-amber-400 text-zinc-950" : "text-zinc-300 hover:bg-white/10 hover:text-zinc-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {msg ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{msg}</div> : null}
      {err ? <div className="rounded-2xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-200">{err}</div> : null}

      {me && activeTab === "profile" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
          <Card>
            <CardBody className="space-y-4">
              <div>
                <div className="text-lg font-semibold text-zinc-50">Данные профиля</div>
                <div className="mt-1 text-sm text-zinc-500">Эти данные помогают мастеру понять, кто записался, какой автомобиль и как связаться.</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-xs text-zinc-400">Имя / ник<Input value={profileDraft.displayName} onChange={(e) => setProfileDraft((p) => ({ ...p, displayName: e.target.value }))} placeholder="Юрий" /></label>
                <label className="space-y-2 text-xs text-zinc-400">Телефон<Input value={profileDraft.phone} onChange={(e) => setProfileDraft((p) => ({ ...p, phone: e.target.value }))} placeholder="+7 ..." /></label>
                <label className="space-y-2 text-xs text-zinc-400">Город<Input value={profileDraft.city} onChange={(e) => setProfileDraft((p) => ({ ...p, city: e.target.value }))} placeholder="Ульяновск" /></label>
                <label className="space-y-2 text-xs text-zinc-400">Автомобиль<Input value={profileDraft.carInfo} onChange={(e) => setProfileDraft((p) => ({ ...p, carInfo: e.target.value }))} placeholder="Например, Kia Spectra 1.6 AT" /></label>
              </div>
              <label className="space-y-2 text-xs text-zinc-400">Описание<Textarea value={profileDraft.about} onChange={(e) => setProfileDraft((p) => ({ ...p, about: e.target.value }))} placeholder="Пару слов о себе или о машине: что обычно нужно ремонтировать, какой формат общения удобен." /></label>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-zinc-50 transition hover:border-amber-300/35">
                  <input className="hidden" type="file" accept="image/*" onChange={handleAvatar} />
                  {avatarLoading ? "Гружу..." : "Загрузить аватарку"}
                </label>
                <Button type="button" onClick={saveProfile} disabled={savingProfile || avatarLoading}>{savingProfile ? "Сохраняю..." : "Сохранить профиль"}</Button>
                {profileDraft.avatarUrl ? <Button type="button" className="bg-white/10 text-zinc-50 shadow-none" onClick={() => setProfileDraft((p) => ({ ...p, avatarUrl: "" }))}>Убрать аватарку</Button> : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-4">
              <div className="text-lg font-semibold text-zinc-50">Сводка аккаунта</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat value={stats.bookings} label="Всего заявок" />
                <Stat value={stats.done} label="Выполнено" />
                <Stat value={stats.reviews} label="Оставлено отзывов" />
                <Stat value={notifications.filter((n) => !n.readAt).length} label="Новых уведомлений" />
              </div>
              {notifications.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-100">Уведомления</div>
                    <Button className="bg-white/10 text-zinc-50 shadow-none" onClick={markAllRead}>Прочитать всё</Button>
                  </div>
                  <div className="space-y-2">
                    {notifications.slice(0, 4).map((n) => <Notification key={n.id} item={n} />)}
                  </div>
                </div>
              ) : <div className="text-sm text-zinc-500">Уведомлений пока нет.</div>}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {me?.role === "USER" && activeTab === "bookings" ? (
        <Card>
          <CardBody className="space-y-3">
            <div className="text-lg font-semibold text-zinc-50">Мои заявки</div>
            {bookings.length === 0 ? (
              <div className="text-sm text-zinc-500">Пока заявок нет. Открой карточку гаража и выбери услугу со свободным временем.</div>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => <BookingCard key={b.id} booking={b} reviewDrafts={reviewDrafts} setReviewDraft={setReviewDraft} submitReview={submitReview} />)}
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}

      {me?.role === "USER" && activeTab === "reviews" ? (
        <div className="grid gap-5 lg:grid-cols-[.95fr_1.05fr]">
          <Card>
            <CardBody className="space-y-3">
              <div>
                <div className="text-lg font-semibold text-zinc-50">Можно оставить отзыв</div>
                <div className="mt-1 text-sm text-zinc-500">Отзыв открывается только после статуса «Выполнена» и только один раз по каждой заявке.</div>
              </div>
              {pendingReviews.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3 text-sm text-zinc-500">Нет выполненных заявок без отзыва.</div> : (
                <div className="space-y-3">
                  {pendingReviews.map((p) => {
                    const draft = reviewDrafts[p.bookingId] ?? { rating: "5", text: "" };
                    return (
                      <div key={p.bookingId} className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
                        <div className="text-sm font-semibold text-zinc-100">#{p.bookingId} • {p.serviceName}</div>
                        <div className="mt-1 text-xs text-zinc-500">{p.garageTitle} • {formatDateTime(p.slotStart)}</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr_auto]">
                          <Input type="number" min="1" max="5" value={draft.rating} onChange={(e) => setReviewDraft(p.bookingId, { rating: e.target.value })} />
                          <Textarea value={draft.text} onChange={(e) => setReviewDraft(p.bookingId, { text: e.target.value })} placeholder="Напиши, как прошёл ремонт" />
                          <Button type="button" onClick={() => submitReview(p.bookingId)}>Отправить</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <div className="text-lg font-semibold text-zinc-50">Мои отзывы</div>
              {myReviews.length === 0 ? <div className="text-sm text-zinc-500">Ты ещё не оставлял отзывы.</div> : (
                <div className="space-y-2">
                  {myReviews.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">{r.garageTitle}</div>
                          <div className="mt-1 text-xs text-zinc-500">#{r.bookingId} • {r.serviceName} • {formatDate(r.createdAt)}</div>
                        </div>
                        <Badge>{"★".repeat(Number(r.rating))}</Badge>
                      </div>
                      {r.text ? <div className="mt-2 text-sm leading-6 text-zinc-400">{r.text}</div> : null}
                      <Link className="mt-2 inline-flex text-xs text-amber-200 underline-offset-4 hover:underline" to={`/garage/${r.garageId}`}>Открыть гараж</Link>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {me?.role === "MASTER" && (
        <Card><CardBody><Link className="text-sm text-amber-200 underline-offset-4 hover:underline" to="/master">Перейти в кабинет мастера</Link></CardBody></Card>
      )}
      {me?.role === "ADMIN" && (
        <Card><CardBody><Link className="text-sm text-amber-200 underline-offset-4 hover:underline" to="/admin">Открыть админ-панель</Link></CardBody></Card>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[.04] p-4">
      <div className="text-3xl font-black text-zinc-50">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function Notification({ item }: { item: NotificationItem }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${item.readAt ? "border-white/10 bg-white/[.04]" : "border-amber-300/25 bg-amber-300/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-zinc-100">{item.title}</div>
        <div className="text-xs text-zinc-500">{formatDateTime(item.createdAt)}</div>
      </div>
      {item.text ? <div className="mt-1 text-sm leading-6 text-zinc-400">{item.text}</div> : null}
      {item.link ? <Link className="mt-2 inline-flex text-xs text-amber-200 underline-offset-4 hover:underline" to={item.link}>Открыть</Link> : null}
    </div>
  );
}

function BookingCard({ booking, reviewDrafts, setReviewDraft, submitReview }: { booking: Booking; reviewDrafts: Record<number, { rating: string; text: string }>; setReviewDraft: (bookingId: number, patch: Partial<{ rating: string; text: string }>) => void; submitReview: (bookingId: number) => void }) {
  const draft = reviewDrafts[booking.id] ?? { rating: "5", text: "" };
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/30 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">#{booking.id} • {booking.serviceName}</div>
          <div className="mt-1 text-xs text-zinc-500">{formatBookingRange(booking.slotStart, booking.slotEnd)}</div>
          <div className="mt-1 text-xs text-zinc-500">{booking.garageTitle} • {booking.garageAddress}</div>
        </div>
        <Badge>{statusText[booking.status] ?? booking.status}</Badge>
      </div>

      {booking.status === "CANCELLED" ? (
        <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-sm text-red-100">Заявка отменена. Слот снова доступен для записи в карточке гаража.</div>
      ) : null}

      {booking.status === "DONE" && booking.reviewId ? (
        <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
          Отзыв оставлен: {"★".repeat(Number(booking.reviewRating ?? 5))} {booking.reviewText ? `— ${booking.reviewText}` : ""}
        </div>
      ) : null}

      {booking.status === "DONE" && !booking.reviewId ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-white/[.04] p-3">
          <div className="text-sm font-semibold text-zinc-100">Оставить отзыв</div>
          <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
            <Input type="number" min="1" max="5" value={draft.rating} onChange={(e) => setReviewDraft(booking.id, { rating: e.target.value })} />
            <Textarea value={draft.text} onChange={(e) => setReviewDraft(booking.id, { text: e.target.value })} placeholder="Что понравилось или что стоит улучшить" />
            <Button type="button" onClick={() => submitReview(booking.id)}>Отправить</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <Link className="text-xs text-amber-200 underline-offset-4 hover:underline" to={`/garage/${booking.garageId}`}>Открыть гараж</Link>
      </div>
    </div>
  );
}
