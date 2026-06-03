import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, CardBody, SectionTitle, Select } from "../ui/components";
import MapEmbed from "../ui/MapEmbed";

type Garage = {
  id: number;
  title: string;
  address: string;
  description?: string;
  phone?: string;
  coverUrl?: string;
  photoUrls?: string[];
  avatarUrl?: string;
  masterName: string;
  masterAbout?: string;
  ratingAvg: number;
  ratingCount: number;
  workSchedule?: string;
  lat?: number;
  lng?: number;
};

type Service = { id: number; category: string; name: string; priceFrom?: number | null; durationMin?: number | null };
type Slot = { id: number; startAt: number; endAt: number; isBooked: number | boolean };
type Review = { id: number; rating: number; text?: string; createdAt: number; userEmail?: string; userDisplayName?: string; userAvatarUrl?: string; userCarInfo?: string };

function readFavorites(): number[] {
  try { return JSON.parse(localStorage.getItem("gm_favorites") || "[]"); } catch { return []; }
}
function saveFavorites(ids: number[]) { localStorage.setItem("gm_favorites", JSON.stringify(ids)); }

function isSlotBooked(slot: Slot) {
  return slot.isBooked === true || slot.isBooked === 1;
}

function slotDateLabel(startAt: number) {
  return new Date(startAt).toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "short" });
}

function slotTimeLabel(slot: Slot) {
  const start = new Date(slot.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const end = new Date(slot.endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${start}–${end}`;
}


export default function Garage() {
  const { id } = useParams();
  const [garage, setGarage] = useState<Garage | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [me, setMe] = useState<any>(null);
  const [serviceId, setServiceId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<number[]>(() => readFavorites());

  async function load() {
    const [gr, auth] = await Promise.all([
      fetch(`/api/garages/${id}`).then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({ ok: false })),
    ]);
    if (gr.ok) {
      setGarage(gr.garage);
      setServices(gr.services ?? []);
      const nextSlots: Slot[] = gr.slots ?? [];
      setSlots(nextSlots);
      setReviews(gr.reviews ?? []);
      if (!serviceId && gr.services?.[0]) setServiceId(String(gr.services[0].id));

      const currentSlot = nextSlots.find((s) => String(s.id) === slotId);
      const firstFreeSlot = nextSlots.find((s) => !isSlotBooked(s));
      if (!currentSlot || isSlotBooked(currentSlot)) setSlotId(firstFreeSlot ? String(firstFreeSlot.id) : "");
    }
    setMe(auth.ok ? auth.user : null);
  }

  useEffect(() => { load(); }, [id]);

  const photos = useMemo(() => {
    if (!garage) return [];
    const arr = [garage.coverUrl, ...(garage.photoUrls ?? [])].filter(Boolean) as string[];
    return Array.from(new Set(arr.length ? arr : ["/images/garage-lada-real.jpg"]));
  }, [garage]);

  const freeSlots = useMemo(() => slots.filter((s) => !isSlotBooked(s)), [slots]);
  const visibleSlots = useMemo(() => slots.slice(0, 42), [slots]);
  const groupedSlots = useMemo(() => {
    return visibleSlots.reduce<Array<{ label: string; items: Slot[] }>>((groups, slot) => {
      const label = slotDateLabel(slot.startAt);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(slot);
      else groups.push({ label, items: [slot] });
      return groups;
    }, []);
  }, [visibleSlots]);
  const selectedSlot = slots.find((s) => String(s.id) === slotId);
  const selectedService = services.find((s) => String(s.id) === serviceId);
  const isFav = garage ? favorites.includes(garage.id) : false;

  function toggleFav() {
    if (!garage) return;
    const set = new Set(favorites);
    set.has(garage.id) ? set.delete(garage.id) : set.add(garage.id);
    const next = [...set];
    saveFavorites(next);
    setFavorites(next);
  }

  async function book() {
    setErr(null);
    setMsg(null);
    if (!garage) return;
    if (!me) return setErr("Чтобы оставить заявку, войди в аккаунт клиента.");
    if (me.role !== "USER") return setErr("Запись доступна для аккаунта клиента.");
    if (!serviceId || !slotId) return setErr("Выбери услугу и свободное время.");
    if (!selectedSlot || isSlotBooked(selectedSlot)) return setErr("Этот слот уже занят. Выбери свободное время.");

    const r = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ garageId: garage.id, serviceId: Number(serviceId), slotId: Number(slotId) }),
    });
    const j = await r.json();
    if (!j.ok) return setErr(j.error ?? "Не удалось создать заявку");
    setMsg(`Заявка #${j.bookingId} создана. Статус можно посмотреть в профиле.`);
    await load();
  }

  if (!garage) return <Card><CardBody className="text-sm text-zinc-400">Загрузка карточки...</CardBody></Card>;

  return (
    <div className="space-y-6">
      <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="overflow-hidden">
          <div className="relative h-[340px] sm:h-[420px] lg:h-[460px]">
            <img src={garage.coverUrl || "/images/garage-lada-real.jpg"} alt={garage.title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-black/60 backdrop-blur">⭐ {Number(garage.ratingAvg).toFixed(1)} • {garage.ratingCount} отзывов</Badge>
                <Badge className="bg-black/60 backdrop-blur">{garage.workSchedule || "По записи"}</Badge>
              </div>
              <h1 className="mt-4 text-3xl font-black text-zinc-50 md:text-5xl">{garage.title}</h1>
              <div className="mt-3 text-sm text-zinc-300">{garage.address}</div>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex items-start gap-3">
                <img src={garage.avatarUrl || "/images/master-ivan.jpg"} alt={garage.masterName} className="h-16 w-16 rounded-3xl object-cover ring-1 ring-white/10" />
                <div>
                  <div className="text-xl font-semibold text-zinc-50">{garage.masterName}</div>
                  <div className="mt-1 text-sm leading-6 text-zinc-400">{garage.masterAbout}</div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <a href={`tel:${garage.phone ?? ""}`} className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-center text-sm text-zinc-200 transition hover:border-amber-300/35 hover:text-amber-100">Позвонить</a>
                <button onClick={toggleFav} className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-center text-sm text-zinc-200 transition hover:border-amber-300/35 hover:text-amber-100">
                  {isFav ? "В избранном" : "В избранное"}
                </button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-4">
              <div className="text-lg font-semibold text-zinc-50">Онлайн-заявка</div>
              <div className="grid gap-3">
                <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                  {services.map((s) => <option key={s.id} value={String(s.id)}>{s.name} — от {s.priceFrom ?? 0} ₽</option>)}
                </Select>
                <div className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-100">Выберите время</div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400/80" />Свободно</span>
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400/80" />Занято</span>
                    </div>
                  </div>

                  {groupedSlots.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-zinc-500">
                      Пока нет доступного расписания. Позвоните мастеру или попробуйте позже.
                    </div>
                  ) : (
                    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                      {groupedSlots.map((group) => (
                        <div key={group.label} className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{group.label}</div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {group.items.map((slot) => {
                              const booked = isSlotBooked(slot);
                              const active = slotId === String(slot.id);
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  disabled={booked}
                                  onClick={() => setSlotId(String(slot.id))}
                                  className={[
                                    "rounded-2xl border px-3 py-2 text-left text-sm transition",
                                    booked
                                      ? "cursor-not-allowed border-red-300/15 bg-red-500/10 text-zinc-500 opacity-70"
                                      : active
                                        ? "border-amber-300/70 bg-amber-300/15 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,.25)]"
                                        : "border-emerald-300/20 bg-emerald-400/10 text-zinc-100 hover:border-amber-300/50 hover:bg-amber-300/10",
                                  ].join(" ")}
                                  title={booked ? "Это время уже занято" : "Выбрать это время"}
                                >
                                  <span className="block font-semibold">{slotTimeLabel(slot)}</span>
                                  <span className={booked ? "mt-1 block text-[11px] text-red-200/70" : "mt-1 block text-[11px] text-emerald-200/75"}>
                                    {booked ? "Занято" : active ? "Выбрано" : "Свободно"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedService ? <div className="text-xs text-zinc-500">Ориентировочная длительность: {selectedService.durationMin ?? 60} мин.</div> : null}
                <Button onClick={book} disabled={!freeSlots.length || !slotId}>Оставить заявку</Button>
                {msg ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{msg}</div> : null}
                {err ? <div className="rounded-2xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-200">{err}</div> : null}
                {!me ? <Link className="text-sm text-amber-200 underline-offset-4 hover:underline" to="/auth/login">Войти перед записью</Link> : null}
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[.95fr_1.05fr]">
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle eyebrow="Описание" title="Что делает мастерская" />
            <p className="text-sm leading-7 text-zinc-300">{garage.description}</p>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => <Badge key={s.id}>{s.category}: {s.name}</Badge>)}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <SectionTitle eyebrow="Карта" title="Как добраться" />
            <MapEmbed lat={garage.lat} lng={garage.lng} title={garage.title} address={garage.address} heightClassName="h-72 sm:h-80" />
          </CardBody>
        </Card>
      </section>

      <section>
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle eyebrow="Галерея" title="Фото гаража" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photos.slice(0, 6).map((p, i) => (
                <img key={`${p}-${i}`} src={p} alt={`Фото ${i + 1}`} className="h-36 w-full rounded-3xl object-cover ring-1 ring-white/10 sm:h-44" />
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle eyebrow="Цены" title="Услуги и стоимость" />
            <div className="space-y-2">
              {services.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{s.name}</div>
                    <div className="text-xs text-zinc-500">{s.category} • {s.durationMin ?? 60} мин.</div>
                  </div>
                  <div className="text-sm font-semibold text-amber-200">от {s.priceFrom ?? 0} ₽</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <SectionTitle eyebrow="Отзывы" title="Оценки клиентов" />
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3 text-sm text-zinc-500">Пока нет отзывов. Отзывы появляются только после выполненной заявки.</div>
              ) : reviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {r.userAvatarUrl ? <img src={r.userAvatarUrl} alt={r.userDisplayName || "Клиент"} className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/10" /> : <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-xs font-black text-zinc-200">{(r.userDisplayName || r.userEmail || "К").slice(0, 2).toUpperCase()}</div>}
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">{r.userDisplayName || (r.userEmail ? r.userEmail.split("@")[0] : "Клиент")}</div>
                        <div className="mt-1 text-xs text-zinc-500">{new Date(r.createdAt).toLocaleDateString()} {r.userCarInfo ? `• ${r.userCarInfo}` : ""}</div>
                      </div>
                    </div>
                    <Badge>{"★".repeat(Number(r.rating))}</Badge>
                  </div>
                  {r.text ? <p className="mt-2 text-sm leading-6 text-zinc-400">{r.text}</p> : null}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
