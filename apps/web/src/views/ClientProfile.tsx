import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, CardBody, SectionTitle } from "../ui/components";

type ClientProfileData = {
  id: number;
  email?: string;
  phone?: string;
  displayName?: string;
  about?: string;
  avatarUrl?: string;
  city?: string;
  carInfo?: string;
  createdAt?: number;
  updatedAt?: number;
};

type ClientStats = {
  bookingsTotal?: number | string;
  bookingsDone?: number | string;
  bookingsCancelled?: number | string;
  bookingsActive?: number | string;
  reviewsTotal?: number | string;
  ratingAvg?: number | string;
};

type ClientBooking = {
  id: number;
  status: "NEW" | "CONFIRMED" | "IN_PROGRESS" | "CANCELLED" | "DONE";
  slotStart: number;
  slotEnd: number;
  garageId: number;
  garageTitle: string;
  garageAddress: string;
  serviceName: string;
  serviceCategory?: string;
  cancelReason?: string;
  masterComment?: string;
};

const statusText: Record<string, string> = {
  NEW: "Новая",
  CONFIRMED: "Подтверждена",
  IN_PROGRESS: "В работе",
  CANCELLED: "Отменена",
  DONE: "Выполнена",
};

const statusClass: Record<string, string> = {
  NEW: "border-amber-300/25 bg-amber-300/10 text-amber-200",
  CONFIRMED: "border-sky-300/25 bg-sky-300/10 text-sky-200",
  IN_PROGRESS: "border-violet-300/25 bg-violet-300/10 text-violet-200",
  CANCELLED: "border-red-300/25 bg-red-300/10 text-red-200",
  DONE: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
};

function toMs(value: unknown) {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: unknown) {
  const ms = toMs(value);
  return ms ? new Date(ms).toLocaleDateString("ru-RU") : "—";
}

function formatBookingTime(startValue: unknown, endValue: unknown) {
  const start = toMs(startValue);
  const end = toMs(endValue);
  if (!start || !end) return "Дата не указана";
  return `${new Date(start).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })} — ${new Date(end).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function initials(profile?: ClientProfileData) {
  const source = profile?.displayName || profile?.email || "К";
  return source.trim().slice(0, 1).toUpperCase();
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[.04] p-4"><div className="text-2xl font-semibold text-zinc-50">{value}</div><div className="mt-1 text-xs text-zinc-500">{label}</div></div>;
}

export default function ClientProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState<ClientProfileData | null>(null);
  const [stats, setStats] = useState<ClientStats>({});
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/users/${id}/profile`);
      const j = await r.json();
      if (!j.ok) {
        setErr(j.error ?? "Не удалось открыть профиль клиента");
        setProfile(null);
        setBookings([]);
        return;
      }
      setProfile(j.profile);
      setStats(j.stats ?? {});
      setBookings(j.bookings ?? []);
    } catch {
      setErr("Не удалось загрузить профиль клиента");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  const donePercent = useMemo(() => {
    const total = num(stats.bookingsTotal);
    return total ? Math.round((num(stats.bookingsDone) / total) * 100) : 0;
  }, [stats]);

  if (loading) return <div className="py-16 text-center text-zinc-500">Загружаем профиль клиента…</div>;

  if (err) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card>
          <CardBody className="space-y-4 text-center">
            <div className="text-2xl font-semibold text-zinc-50">Профиль недоступен</div>
            <div className="text-sm text-zinc-400">{err}</div>
            <Link to="/master"><Button>Вернуться в кабинет</Button></Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6 pb-12">
      <SectionTitle eyebrow="Клиент" title={profile.displayName || profile.email || "Профиль клиента"}>
        Карточка клиента помогает мастеру понимать, кто записался, какой автомобиль указан и какая история заявок есть по этому клиенту.
      </SectionTitle>

      <Card>
        <CardBody>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.displayName || "Клиент"} className="h-20 w-20 rounded-3xl object-cover ring-1 ring-white/10" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[.05] text-3xl font-semibold text-amber-200">{initials(profile)}</div>
              )}
              <div>
                <div className="text-2xl font-semibold text-zinc-50">{profile.displayName || "Клиент"}</div>
                <div className="mt-1 text-sm text-zinc-500">На сайте с {formatDate(profile.createdAt)}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.city ? <Badge>{profile.city}</Badge> : null}
                  {profile.carInfo ? <Badge>{profile.carInfo}</Badge> : null}
                  <Badge>{num(stats.bookingsTotal)} заявок</Badge>
                </div>
              </div>
            </div>
            <div className="grid gap-2 text-sm text-zinc-400 sm:text-right">
              {profile.phone ? <a className="text-amber-200 hover:text-amber-100" href={`tel:${profile.phone}`}>{profile.phone}</a> : <span>Телефон не указан</span>}
              {profile.email ? <a className="text-zinc-300 hover:text-zinc-100" href={`mailto:${profile.email}`}>{profile.email}</a> : null}
            </div>
          </div>
          {profile.about ? <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-300">{profile.about}</div> : null}
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat value={num(stats.bookingsTotal)} label="Заявок по клиенту" />
        <Stat value={num(stats.bookingsActive)} label="Активные" />
        <Stat value={num(stats.bookingsDone)} label="Выполнено" />
        <Stat value={`${donePercent}%`} label="Доля выполненных" />
        <Stat value={num(stats.reviewsTotal)} label="Оставлено отзывов" />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-zinc-50">История заявок</div>
              <div className="text-sm text-zinc-500">Мастер видит заявки этого клиента только по своим гаражам.</div>
            </div>
            <Badge>{bookings.length}</Badge>
          </div>

          {bookings.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[.04] p-5 text-sm text-zinc-500">Истории заявок пока нет.</div>
          ) : (
            <div className="space-y-3">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-3xl border border-white/10 bg-white/[.04] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">#{booking.id} • {booking.serviceName}</div>
                      <div className="mt-1 text-xs text-zinc-500">{formatBookingTime(booking.slotStart, booking.slotEnd)}</div>
                      <Link to={`/garage/${booking.garageId}`} className="mt-1 block text-xs text-amber-200 hover:text-amber-100">{booking.garageTitle} • {booking.garageAddress}</Link>
                    </div>
                    <Badge className={statusClass[booking.status]}>{statusText[booking.status]}</Badge>
                  </div>
                  {booking.cancelReason ? <div className="mt-3 text-xs text-red-200">Причина отмены: {booking.cancelReason}</div> : null}
                  {booking.masterComment ? <div className="mt-3 text-xs text-zinc-400">Комментарий мастера: {booking.masterComment}</div> : null}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
