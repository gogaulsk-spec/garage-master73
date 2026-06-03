import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Card, CardBody, Badge, Button, Input, SectionTitle, Textarea } from "../ui/components";

type Booking = {
  id: number;
  status: "NEW" | "CONFIRMED" | "IN_PROGRESS" | "CANCELLED" | "DONE";
  cancelReason?: string;
  slotStart: number;
  slotEnd: number;
  garageTitle: string;
  garageAddress: string;
  serviceName: string;
  userEmail?: string;
  userPhone?: string;
  userDisplayName?: string;
  userAvatarUrl?: string;
  userCarInfo?: string;
};

type Service = { id: number; category: string; name: string };
type MasterGarage = {
  id: number;
  title: string;
  address: string;
  description?: string;
  phone?: string;
  coverUrl?: string;
  photoUrls?: string[];
  is_approved: number;
  moderationReason?: string;
  servicesCount: number;
  futureSlotsCount: number;
  workSchedule?: string;
};

type MasterProfile = { displayName?: string; about?: string; avatarUrl?: string; experienceYears?: number; specialization?: string; city?: string; phone?: string; ratingAvg?: number; ratingCount?: number };
type Review = { id: number; rating: number; text?: string; createdAt: number; replyText?: string; garageTitle: string; userEmail?: string; userDisplayName?: string; userAvatarUrl?: string; userCarInfo?: string };
type NotificationItem = { id: number; type: string; title: string; text?: string; link?: string; readAt?: number | null; createdAt: number };

type FormService = { serviceId: number; checked: boolean; priceFrom: string; durationMin: string };
type ScheduleMode = "weekdays" | "daily" | "custom";
type ScheduleDraft = { workSchedule: string; daysAhead: string; startTime: string; endTime: string; slotDurationMin: string; daysMode: ScheduleMode; weekdays: number[] };

const DAY_OPTIONS = [
  { value: 1, label: "Пн" }, { value: 2, label: "Вт" }, { value: 3, label: "Ср" }, { value: 4, label: "Чт" }, { value: 5, label: "Пт" }, { value: 6, label: "Сб" }, { value: 0, label: "Вс" },
];
const WORKDAYS = [1, 2, 3, 4, 5];
const EVERYDAY = [0, 1, 2, 3, 4, 5, 6];
const MAX_PHOTOS = 5;

const defaultForm = {
  title: "",
  address: "",
  description: "",
  phone: "",
  coverUrl: "/images/garage-lada-real.jpg",
  photoUrls: "/images/garage-lada-real.jpg\n/images/garage-lift-clean.jpg",
  workSchedule: "По будням 10:00–18:00",
  lat: "",
  lng: "",
  daysAhead: "14",
  startTime: "10:00",
  endTime: "18:00",
  slotDurationMin: "60",
  daysMode: "weekdays" as ScheduleMode,
  weekdays: WORKDAYS,
};

const statusText: Record<string, string> = { NEW: "Новая", CONFIRMED: "Подтверждена", IN_PROGRESS: "В работе", CANCELLED: "Отменена", DONE: "Выполнена" };
const statusClass: Record<string, string> = {
  NEW: "border-amber-300/25 bg-amber-300/10 text-amber-200",
  CONFIRMED: "border-sky-300/25 bg-sky-300/10 text-sky-200",
  IN_PROGRESS: "border-violet-300/25 bg-violet-300/10 text-violet-200",
  CANCELLED: "border-red-300/25 bg-red-300/10 text-red-200",
  DONE: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
};

function photoList(value: string) { return value.split("\n").map((x) => x.trim()).filter(Boolean); }
function toMs(value: unknown) { const n = Number(value); if (Number.isFinite(n)) return n; const parsed = Date.parse(String(value)); return Number.isFinite(parsed) ? parsed : 0; }
function bookingTimeRange(startValue: unknown, endValue: unknown) {
  const start = toMs(startValue); const end = toMs(endValue);
  if (!start || !end) return "Дата не указана";
  return `${new Date(start).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })} — ${new Date(end).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}
function formatDate(value: unknown) { const ms = toMs(value); return ms ? new Date(ms).toLocaleDateString("ru-RU") : ""; }

function resizeImageFile(file: File, size = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error(`Файл ${file.name} не является изображением.`));
    if (file.size > 8 * 1024 * 1024) return reject(new Error(`Файл ${file.name} больше 8 МБ.`));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Не удалось прочитать файл ${file.name}.`));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error(`Не удалось обработать изображение ${file.name}.`));
      image.onload = () => {
        const scale = Math.min(1, size / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Браузер не смог подготовить изображение."));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function effectiveWeekdays(mode: ScheduleMode, weekdays: number[]) {
  if (mode === "daily") return EVERYDAY;
  if (mode === "weekdays") return WORKDAYS;
  return weekdays.length ? weekdays : WORKDAYS;
}
function daysText(mode: ScheduleMode, weekdays: number[]) {
  if (mode === "daily") return "каждый день";
  if (mode === "weekdays") return "по будням";
  return effectiveWeekdays(mode, weekdays).map((day) => DAY_OPTIONS.find((x) => x.value === day)?.label).filter(Boolean).join(", ");
}
function scheduleCaption(draft: ScheduleDraft) { return `${daysText(draft.daysMode, draft.weekdays)} ${draft.startTime}–${draft.endTime}`; }
function normalizeSchedulePatch<T extends ScheduleDraft>(base: T, patch: Partial<ScheduleDraft>): T {
  const next = { ...base, ...patch } as T;
  if (patch.daysMode === "daily") next.weekdays = EVERYDAY;
  if (patch.daysMode === "weekdays") next.weekdays = WORKDAYS;
  if (patch.daysMode === "custom" && !next.weekdays.length) next.weekdays = WORKDAYS;
  if (!patch.workSchedule) next.workSchedule = scheduleCaption(next);
  return next;
}
function schedulePayload(draft: ScheduleDraft) {
  const normalized = normalizeSchedulePatch(draft, {});
  return { workSchedule: normalized.workSchedule || scheduleCaption(normalized), daysAhead: Number(normalized.daysAhead || 14), startTime: normalized.startTime || "10:00", endTime: normalized.endTime || "18:00", slotDurationMin: Number(normalized.slotDurationMin || 60), daysMode: normalized.daysMode, weekdays: effectiveWeekdays(normalized.daysMode, normalized.weekdays) };
}

function ScheduleFields({ value, onChange }: { value: ScheduleDraft; onChange: (patch: Partial<ScheduleDraft>) => void }) {
  const selectedDays = effectiveWeekdays(value.daysMode, value.weekdays);
  const modeButton = (mode: ScheduleMode, label: string) => (
    <button type="button" onClick={() => onChange({ daysMode: mode })} className={`rounded-2xl border px-4 py-2 text-sm transition ${value.daysMode === mode ? "border-amber-300/60 bg-amber-300/15 text-amber-100" : "border-white/10 bg-white/[.04] text-zinc-300 hover:border-amber-300/35"}`}>{label}</button>
  );
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[.04] p-4">
      <div><div className="text-sm font-semibold text-zinc-100">Расписание записи</div><div className="mt-1 text-xs text-zinc-500">Выбери дни работы, время начала и окончания. Слоты создаются автоматически.</div></div>
      <div className="flex flex-wrap gap-2">{modeButton("weekdays", "По будням")}{modeButton("daily", "Каждый день")}{modeButton("custom", "Выбрать дни")}</div>
      {value.daysMode === "custom" ? <div className="flex flex-wrap gap-2">{DAY_OPTIONS.map((day) => {
        const active = selectedDays.includes(day.value);
        return <button key={day.value} type="button" onClick={() => { const current = new Set(value.weekdays); current.has(day.value) ? current.delete(day.value) : current.add(day.value); onChange({ weekdays: DAY_OPTIONS.map((x) => x.value).filter((x) => current.has(x)) }); }} className={`h-10 min-w-10 rounded-2xl border px-3 text-sm font-semibold transition ${active ? "border-emerald-300/45 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-black/20 text-zinc-500"}`}>{day.label}</button>;
      })}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2 text-xs text-zinc-400">Создать слоты на дней вперёд<Input type="number" min="1" max="60" value={value.daysAhead} onChange={(e) => onChange({ daysAhead: e.target.value })} /></label>
        <label className="space-y-2 text-xs text-zinc-400">Начало рабочего дня<Input type="time" value={value.startTime} onChange={(e) => onChange({ startTime: e.target.value })} /></label>
        <label className="space-y-2 text-xs text-zinc-400">Конец рабочего дня<Input type="time" value={value.endTime} onChange={(e) => onChange({ endTime: e.target.value })} /></label>
        <label className="space-y-2 text-xs text-zinc-400">Длительность слота, минут<Input type="number" min="30" max="240" step="15" value={value.slotDurationMin} onChange={(e) => onChange({ slotDurationMin: e.target.value })} /></label>
      </div>
      <label className="block space-y-2 text-xs text-zinc-400">Подпись графика в карточке<Input value={value.workSchedule} onChange={(e) => onChange({ workSchedule: e.target.value })} placeholder={scheduleCaption(value)} /></label>
    </div>
  );
}

export default function Master() {
  const [me, setMe] = useState<any>(null);
  const [profile, setProfile] = useState<MasterProfile>({});
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [myGarages, setMyGarages] = useState<MasterGarage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, ScheduleDraft>>({});
  const [form, setForm] = useState(defaultForm);
  const [formServices, setFormServices] = useState<FormService[]>([]);
  const [showGarageForm, setShowGarageForm] = useState(false);
  const [editingGarageId, setEditingGarageId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"requests" | "garages" | "reviews" | "profile">("requests");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  async function load() {
    setErr(null);
    const [authRes, servicesRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/services")]);
    const authJson = await authRes.json();
    const servicesJson = await servicesRes.json();
    const serviceRows = (servicesJson.services ?? []) as Service[];
    setServices(serviceRows);
    setFormServices((prev) => serviceRows.map((s) => prev.find((x) => x.serviceId === s.id) ?? { serviceId: s.id, checked: false, priceFrom: "", durationMin: "60" }));
    setMe(authJson.ok ? authJson.user : null);
    if (authJson.ok && authJson.user?.role === "MASTER") {
      const [br, gr, nr, pr, rr] = await Promise.all([fetch("/api/master/bookings"), fetch("/api/master/garages"), fetch("/api/notifications"), fetch("/api/master/profile"), fetch("/api/master/reviews")]);
      const [bj, gj, nj, pj, rj] = await Promise.all([br.json(), gr.json(), nr.json(), pr.json(), rr.json()]);
      const garages = (gj.garages ?? []) as MasterGarage[];
      setBookings(bj.bookings ?? []);
      setMyGarages(garages);
      setNotifications(nj.notifications ?? []);
      setProfile(pj.profile ?? {});
      setReviews(rj.reviews ?? []);
      setReplyDrafts((prev) => {
        const next = { ...prev };
        for (const r of (rj.reviews ?? []) as Review[]) if (!next[r.id]) next[r.id] = r.replyText || "";
        return next;
      });
      setScheduleDrafts((prev) => {
        const next = { ...prev };
        for (const g of garages) if (!next[g.id]) next[g.id] = { workSchedule: g.workSchedule || "По будням 10:00–18:00", daysAhead: "14", startTime: "10:00", endTime: "18:00", slotDurationMin: "60", daysMode: "weekdays", weekdays: WORKDAYS };
        return next;
      });
    }
  }
  useEffect(() => { load(); }, []);

  const groupedServices = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const service of services) { if (!map.has(service.category)) map.set(service.category, []); map.get(service.category)!.push(service); }
    return Array.from(map.entries());
  }, [services]);
  const photos = useMemo(() => photoList(form.photoUrls), [form.photoUrls]);
  const activeBookings = bookings.filter((b) => b.status === "NEW" || b.status === "CONFIRMED" || b.status === "IN_PROGRESS");
  const historyBookings = bookings.filter((b) => b.status === "CANCELLED" || b.status === "DONE");

  function resetGarageForm() {
    setEditingGarageId(null);
    setForm(defaultForm);
    setFormServices((prev) => prev.map((x) => ({ ...x, checked: false, priceFrom: "", durationMin: "60" })));
    setShowGarageForm(false);
  }

  async function openEditGarage(id: number) {
    setErr(null); setOk(null);
    const j = await fetch(`/api/master/garages/${id}`).then((r) => r.json()).catch(() => ({ ok: false, error: "Сервер не ответил" }));
    if (!j.ok) return setErr(j.error ?? "Не удалось открыть гараж");
    const g = j.garage;
    setEditingGarageId(id);
    setShowGarageForm(true);
    setActiveTab("garages");
    setForm({ ...defaultForm, title: g.title || "", address: g.address || "", description: g.description || "", phone: g.phone || "", coverUrl: g.coverUrl || defaultForm.coverUrl, photoUrls: (g.photoUrls?.length ? g.photoUrls : [g.coverUrl || defaultForm.coverUrl]).join("\n"), workSchedule: g.workSchedule || "По записи", lat: g.lat ? String(g.lat) : "", lng: g.lng ? String(g.lng) : "" });
    const selected = new Map<number, any>((j.services ?? []).map((x: any) => [Number(x.serviceId), x]));
    setFormServices(services.map((s) => { const cur = selected.get(s.id); return { serviceId: s.id, checked: !!cur, priceFrom: cur?.priceFrom ? String(cur.priceFrom) : "", durationMin: cur?.durationMin ? String(cur.durationMin) : "60" }; }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function setStatus(id: number, status: "CONFIRMED" | "IN_PROGRESS" | "CANCELLED" | "DONE") {
    setErr(null); setOk(null);
    const reason = status === "CANCELLED" ? window.prompt("Причина отмены для клиента", "") || "" : "";
    const r = await fetch(`/api/master/bookings/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason }) });
    const j = await r.json();
    if (!j.ok) return setErr(j.error ?? "Ошибка");
    setOk("Статус заявки обновлён.");
    await load();
  }

  async function findCoordinates() {
    setErr(null); setOk(null);
    if (form.address.trim().length < 5) return setErr("Сначала укажи адрес гаража.");
    setGeocoding(true);
    try {
      const r = await fetch(`/api/geocode?address=${encodeURIComponent(form.address)}`);
      const j = await r.json();
      if (!j.ok) return setErr(j.error ?? "Не удалось найти координаты. Можно ввести их вручную.");
      setForm((p) => ({ ...p, lat: String(Number(j.lat).toFixed(6)), lng: String(Number(j.lng).toFixed(6)) }));
      setOk(`Координаты найдены: ${Number(j.lat).toFixed(6)}, ${Number(j.lng).toFixed(6)}.`);
    } finally { setGeocoding(false); }
  }

  async function handlePhotoFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    e.target.value = "";
    if (!files.length) return;
    setUploadingPhotos(true); setErr(null); setOk(null);
    try {
      const urls = await Promise.all(files.map((f) => resizeImageFile(f)));
      setForm((p) => ({ ...p, coverUrl: urls[0], photoUrls: urls.join("\n") }));
      setOk(`Фото добавлены: ${urls.length} шт.`);
    } catch (error) { setErr(error instanceof Error ? error.message : "Не удалось загрузить фото."); }
    finally { setUploadingPhotos(false); }
  }

  async function handleProfileAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    try { const avatarUrl = await resizeImageFile(file, 512); setProfile((p) => ({ ...p, avatarUrl })); }
    catch (error) { setErr(error instanceof Error ? error.message : "Не удалось загрузить аватарку"); }
  }

  async function saveProfile() {
    setErr(null); setOk(null);
    const r = await fetch("/api/master/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    const j = await r.json().catch(() => ({ ok: false, error: "Сервер не ответил" }));
    if (!j.ok) return setErr(j.error ?? "Не удалось сохранить профиль мастера");
    setOk("Профиль мастера сохранён.");
    await load();
  }

  async function saveGarage(e: FormEvent) {
    e.preventDefault(); setErr(null); setOk(null);
    const selectedServices = formServices.filter((x) => x.checked).map((x) => ({ serviceId: x.serviceId, priceFrom: x.priceFrom ? Number(x.priceFrom) : undefined, durationMin: x.durationMin ? Number(x.durationMin) : undefined }));
    if (!selectedServices.length) return setErr("Выбери хотя бы одну услугу.");
    const schedule = schedulePayload(form);
    setSaving(true);
    try {
      const payload: any = { title: form.title, address: form.address, description: form.description, phone: form.phone, coverUrl: form.coverUrl, photoUrls: photos, workSchedule: schedule.workSchedule, lat: form.lat ? Number(form.lat) : undefined, lng: form.lng ? Number(form.lng) : undefined, services: selectedServices };
      if (!editingGarageId) payload.schedule = schedule;
      const r = await fetch(editingGarageId ? `/api/master/garages/${editingGarageId}` : "/api/master/garages", { method: editingGarageId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j.ok) return setErr(j.error ?? "Не удалось сохранить гараж");
      setOk(editingGarageId ? "Карточка обновлена и отправлена на повторную модерацию." : `Гараж создан. Слотов добавлено: ${j.slotsCreated}.`);
      resetGarageForm();
      await load();
    } finally { setSaving(false); }
  }

  function updateService(id: number, patch: Partial<FormService>) { setFormServices((prev) => prev.map((item) => (item.serviceId === id ? { ...item, ...patch } : item))); }
  function updateScheduleDraft(id: number, patch: Partial<ScheduleDraft>) { setScheduleDrafts((prev) => ({ ...prev, [id]: normalizeSchedulePatch(prev[id] ?? { workSchedule: "По будням 10:00–18:00", daysAhead: "14", startTime: "10:00", endTime: "18:00", slotDurationMin: "60", daysMode: "weekdays", weekdays: WORKDAYS }, patch) })); }
  async function saveSchedule(id: number) {
    setErr(null); setOk(null);
    const draft = scheduleDrafts[id]; if (!draft) return;
    const r = await fetch(`/api/master/garages/${id}/schedule`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(schedulePayload(draft)) });
    const j = await r.json();
    if (!j.ok) return setErr(j.error ?? "Не удалось обновить расписание");
    setOk(`Расписание обновлено. Новых свободных слотов: ${j.slotsCreated}.`);
    await load();
  }

  async function saveReply(reviewId: number) {
    setErr(null); setOk(null);
    const text = (replyDrafts[reviewId] || "").trim();
    const r = await fetch(`/api/master/reviews/${reviewId}/reply`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => ({ ok: false, error: "Сервер не ответил" }));
    if (!j.ok) return setErr(j.error ?? "Не удалось сохранить ответ");
    setOk("Ответ на отзыв сохранён.");
    await load();
  }

  if (!me) return <Card><CardBody className="text-sm text-zinc-400">Войди в аккаунт мастера, чтобы управлять гаражом и заявками.</CardBody></Card>;
  if (me.role !== "MASTER") return <Card><CardBody className="text-sm text-zinc-400">Для этой страницы нужен аккаунт мастера.</CardBody></Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle eyebrow="Кабинет мастера" title="Управление гаражом и заявками">Создавай карточки, подтверждай записи, отвечай на отзывы и редактируй расписание.</SectionTitle>
        <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => { resetGarageForm(); setShowGarageForm(true); setActiveTab("garages"); }}>+ Добавить гараж</Button><Link to="/support" className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2 text-sm font-semibold text-zinc-100">Поддержка</Link></div>
      </div>

      {(err || ok) ? <div className={`rounded-2xl border px-4 py-3 text-sm ${err ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>{err || ok}</div> : null}

      <div className="flex flex-wrap gap-2">
        {[ ["requests", `Заявки (${activeBookings.length})`], ["garages", `Гаражи (${myGarages.length})`], ["reviews", `Отзывы (${reviews.length})`], ["profile", "Профиль мастера"] ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActiveTab(key as any)} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${activeTab === key ? "border-amber-300/40 bg-amber-300/15 text-amber-100" : "border-white/10 bg-white/[.04] text-zinc-300 hover:border-amber-300/35"}`}>{label}</button>
        ))}
      </div>

      {notifications.length > 0 ? <Card><CardBody className="flex flex-wrap gap-2">{notifications.slice(0, 5).map((n) => <Badge key={n.id} className={!n.readAt ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : ""}>{n.title}</Badge>)}</CardBody></Card> : null}

      {activeTab === "requests" ? <Card><CardBody className="space-y-4"><div className="text-xl font-semibold text-zinc-50">Заявки</div><BookingList title="Активные" rows={activeBookings} setStatus={setStatus} /><BookingList title="История" rows={historyBookings} setStatus={setStatus} /></CardBody></Card> : null}

      {activeTab === "garages" ? <div className="space-y-5">
        {showGarageForm ? <Card><CardBody><GarageForm editing={!!editingGarageId} form={form} setForm={setForm} photos={photos} handlePhotoFiles={handlePhotoFiles} uploadingPhotos={uploadingPhotos} findCoordinates={findCoordinates} geocoding={geocoding} groupedServices={groupedServices} formServices={formServices} updateService={updateService} saveGarage={saveGarage} saving={saving} onCancel={resetGarageForm} /></CardBody></Card> : null}
        <Card><CardBody className="space-y-3"><div className="text-xl font-semibold text-zinc-50">Мои гаражи</div>{myGarages.length === 0 ? <div className="text-sm text-zinc-500">Вы ещё не добавили гараж. Нажмите «+ Добавить гараж», заполните карточку и отправьте её на модерацию.</div> : <div className="grid gap-3 md:grid-cols-2">{myGarages.map((g) => <GarageManageCard key={g.id} g={g} scheduleDraft={scheduleDrafts[g.id]} updateSchedule={(patch) => updateScheduleDraft(g.id, patch)} saveSchedule={() => saveSchedule(g.id)} edit={() => openEditGarage(g.id)} />)}</div>}</CardBody></Card>
      </div> : null}

      {activeTab === "reviews" ? <Card><CardBody className="space-y-3"><div className="text-xl font-semibold text-zinc-50">Отзывы клиентов</div>{reviews.length === 0 ? <div className="text-sm text-zinc-500">Отзывов пока нет. После выполненных заявок клиенты смогут оставить оценку, а вы сможете ответить.</div> : <div className="space-y-3">{reviews.map((r) => <ReviewCard key={r.id} r={r} value={replyDrafts[r.id] || ""} setValue={(text) => setReplyDrafts((p) => ({ ...p, [r.id]: text }))} save={() => saveReply(r.id)} />)}</div>}</CardBody></Card> : null}

      {activeTab === "profile" ? <Card><CardBody className="space-y-4"><div className="text-xl font-semibold text-zinc-50">Профиль мастера</div><div className="grid gap-4 lg:grid-cols-[180px_1fr]"><div className="space-y-3"><div className="h-36 w-36 overflow-hidden rounded-3xl border border-white/10 bg-white/[.04]">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="Аватар" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl font-black text-zinc-500">GM</div>}</div><label className="inline-flex cursor-pointer rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2 text-sm font-semibold text-zinc-100"><input type="file" accept="image/*" onChange={handleProfileAvatar} className="hidden" />Аватарка</label></div><div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-xs text-zinc-400">Имя мастера<Input value={profile.displayName || ""} onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))} /></label><label className="space-y-2 text-xs text-zinc-400">Телефон<Input value={profile.phone || ""} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} /></label><label className="space-y-2 text-xs text-zinc-400">Город<Input value={profile.city || ""} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} /></label><label className="space-y-2 text-xs text-zinc-400">Опыт, лет<Input type="number" min="0" max="60" value={profile.experienceYears ?? 0} onChange={(e) => setProfile((p) => ({ ...p, experienceYears: Number(e.target.value) }))} /></label><label className="space-y-2 text-xs text-zinc-400 md:col-span-2">Специализация<Input value={profile.specialization || ""} onChange={(e) => setProfile((p) => ({ ...p, specialization: e.target.value }))} placeholder="Например: электрика, подвеска, ВАЗ, Kia" /></label><label className="space-y-2 text-xs text-zinc-400 md:col-span-2">Описание<Textarea value={profile.about || ""} onChange={(e) => setProfile((p) => ({ ...p, about: e.target.value }))} /></label></div></div><Button type="button" onClick={saveProfile}>Сохранить профиль мастера</Button></CardBody></Card> : null}
    </div>
  );
}

function BookingList({ title, rows, setStatus }: { title: string; rows: Booking[]; setStatus: (id: number, status: "CONFIRMED" | "IN_PROGRESS" | "CANCELLED" | "DONE") => void }) {
  return <div className="space-y-2"><div className="text-sm font-semibold text-zinc-100">{title}</div>{rows.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3 text-sm text-zinc-500">Заявок в этом разделе пока нет.</div> : rows.map((b) => <div key={b.id} className="rounded-3xl border border-white/10 bg-white/[.04] px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm text-zinc-100">#{b.id} • {b.serviceName}</div><div className="text-xs text-zinc-500">{bookingTimeRange(b.slotStart, b.slotEnd)}</div><div className="text-xs text-zinc-500">{b.garageTitle} • {b.garageAddress}</div><div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">{b.userAvatarUrl ? <img src={b.userAvatarUrl} alt={b.userDisplayName || b.userEmail || "Клиент"} className="h-7 w-7 rounded-xl object-cover ring-1 ring-white/10" /> : null}<span>Клиент: {b.userDisplayName || b.userEmail || "—"} {b.userPhone ? `• ${b.userPhone}` : ""} {b.userCarInfo ? `• ${b.userCarInfo}` : ""}</span></div>{b.cancelReason ? <div className="mt-2 text-xs text-red-200">Причина отмены: {b.cancelReason}</div> : null}</div><Badge className={statusClass[b.status]}>{statusText[b.status]}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => setStatus(b.id, "CONFIRMED")} disabled={b.status !== "NEW"}>Подтвердить</Button><Button className="bg-white/10 text-zinc-50 shadow-none" onClick={() => setStatus(b.id, "IN_PROGRESS")} disabled={b.status !== "CONFIRMED"}>В работу</Button><Button className="bg-white/10 text-zinc-50 shadow-none" onClick={() => setStatus(b.id, "CANCELLED")} disabled={b.status === "CANCELLED" || b.status === "DONE"}>Отменить</Button><Button className="bg-white/10 text-zinc-50 shadow-none" onClick={() => setStatus(b.id, "DONE")} disabled={b.status !== "IN_PROGRESS" && b.status !== "CONFIRMED"}>Завершить</Button></div></div>)}</div>;
}

function GarageForm(props: any) {
  const { editing, form, setForm, photos, handlePhotoFiles, uploadingPhotos, findCoordinates, geocoding, groupedServices, formServices, updateService, saveGarage, saving, onCancel } = props;
  return <form onSubmit={saveGarage} className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xl font-semibold text-zinc-50">{editing ? "Редактировать гараж" : "Добавить гараж"}</div><div className="mt-1 text-sm text-zinc-500">После сохранения карточка отправляется на модерацию.</div></div><Button type="button" className="bg-white/10 text-zinc-50 shadow-none" onClick={onCancel}>Закрыть</Button></div><div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-xs text-zinc-400">Название<Input value={form.title} onChange={(e) => setForm((p: any) => ({ ...p, title: e.target.value }))} /></label><label className="space-y-2 text-xs text-zinc-400">Телефон<Input value={form.phone} onChange={(e) => setForm((p: any) => ({ ...p, phone: e.target.value }))} /></label></div><label className="block space-y-2 text-xs text-zinc-400">Адрес<div className="grid gap-2 md:grid-cols-[1fr_auto]"><Input value={form.address} onChange={(e) => setForm((p: any) => ({ ...p, address: e.target.value }))} /><Button type="button" onClick={findCoordinates} disabled={geocoding}>{geocoding ? "Ищу..." : "Найти на карте"}</Button></div></label><label className="block space-y-2 text-xs text-zinc-400">Описание<Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} /></label><div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-xs text-zinc-400">График работы<Input value={form.workSchedule} onChange={(e) => setForm((p: any) => ({ ...p, workSchedule: e.target.value }))} /></label><div className="space-y-2 text-xs text-zinc-400"><div>Фото гаража</div><label className="flex min-h-[46px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-amber-300/35 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100"><input className="hidden" type="file" accept="image/*" multiple onChange={handlePhotoFiles} disabled={uploadingPhotos} />{uploadingPhotos ? "Обрабатываю..." : "Выбрать фото"}</label></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{photos.map((src: string, i: number) => <div key={`${src.slice(0, 24)}-${i}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30"><img src={src} alt="Фото" className="h-28 w-full object-cover" /><div className="px-3 py-2 text-xs text-zinc-400">{i === 0 ? "Обложка" : `Фото ${i + 1}`}</div></div>)}</div><div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-xs text-zinc-400">Широта<Input value={form.lat} onChange={(e) => setForm((p: any) => ({ ...p, lat: e.target.value }))} /></label><label className="space-y-2 text-xs text-zinc-400">Долгота<Input value={form.lng} onChange={(e) => setForm((p: any) => ({ ...p, lng: e.target.value }))} /></label></div><div className="space-y-3"><div className="text-sm font-semibold text-zinc-100">Услуги и цены</div>{groupedServices.map(([category, items]: [string, Service[]]) => <div key={category} className="space-y-2 rounded-3xl border border-white/10 bg-white/[.04] p-4"><div className="text-sm text-amber-200">{category}</div>{items.map((service) => { const current = formServices.find((x: FormService) => x.serviceId === service.id) ?? { serviceId: service.id, checked: false, priceFrom: "", durationMin: "60" }; return <div key={service.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_140px] md:items-center"><label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={current.checked} onChange={(e) => updateService(service.id, { checked: e.target.checked })} /><span>{service.name}</span></label><Input type="number" min="0" placeholder="Цена от, ₽" value={current.priceFrom} onChange={(e) => updateService(service.id, { priceFrom: e.target.value })} disabled={!current.checked} /><Input type="number" min="15" step="15" placeholder="Минут" value={current.durationMin} onChange={(e) => updateService(service.id, { durationMin: e.target.value })} disabled={!current.checked} /></div>; })}</div>)}</div>{!editing ? <ScheduleFields value={form} onChange={(patch) => setForm((p: any) => normalizeSchedulePatch(p, patch))} /> : null}<Button type="submit" disabled={saving || uploadingPhotos}>{saving ? "Сохраняю..." : editing ? "Сохранить и отправить на модерацию" : "Создать гараж"}</Button></form>;
}

function GarageManageCard({ g, scheduleDraft, updateSchedule, saveSchedule, edit }: { g: MasterGarage; scheduleDraft?: ScheduleDraft; updateSchedule: (patch: Partial<ScheduleDraft>) => void; saveSchedule: () => void; edit: () => void }) {
  const rejected = !g.is_approved && !!g.moderationReason;
  return <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/25"><img src={g.coverUrl || "/images/garage-lada-real.jpg"} alt={g.title} className="h-36 w-full object-cover" /><div className="space-y-3 p-4"><div className="font-semibold text-zinc-50">{g.title}</div><div className="text-xs text-zinc-500">{g.address}</div><div className="flex flex-wrap gap-2"><Badge className={g.is_approved ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : rejected ? "border-red-300/25 bg-red-300/10 text-red-200" : "border-amber-300/25 bg-amber-300/10 text-amber-200"}>{g.is_approved ? "Опубликован" : rejected ? "Отклонён" : "На модерации"}</Badge><Badge>Услуг: {g.servicesCount}</Badge><Badge>Свободных слотов: {g.futureSlotsCount}</Badge></div>{rejected ? <div className="rounded-2xl border border-red-400/15 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-100"><span className="font-semibold">Причина отказа:</span> {g.moderationReason}</div> : null}<div className="flex flex-wrap gap-2"><Button type="button" onClick={edit}>Редактировать карточку</Button><Link to={`/garage/${g.id}`} className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2 text-sm font-semibold text-zinc-100">Открыть</Link></div>{scheduleDraft ? <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[.04] p-3"><ScheduleFields value={scheduleDraft} onChange={updateSchedule} /><Button type="button" className="bg-white/10 text-zinc-50 shadow-none" onClick={saveSchedule}>Сохранить расписание</Button></div> : null}</div></div>;
}

function ReviewCard({ r, value, setValue, save }: { r: Review; value: string; setValue: (text: string) => void; save: () => void }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[.04] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2">{r.userAvatarUrl ? <img src={r.userAvatarUrl} alt={r.userDisplayName || "Клиент"} className="h-10 w-10 rounded-xl object-cover" /> : null}<div><div className="text-sm font-semibold text-zinc-100">{r.userDisplayName || r.userEmail || "Клиент"}</div><div className="text-xs text-zinc-500">{r.garageTitle} • {formatDate(r.createdAt)} {r.userCarInfo ? `• ${r.userCarInfo}` : ""}</div></div></div><Badge>{"★".repeat(Number(r.rating))}</Badge></div>{r.text ? <div className="mt-3 text-sm leading-6 text-zinc-400">{r.text}</div> : null}<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ответ мастера на отзыв" /><Button type="button" onClick={save}>{r.replyText ? "Обновить ответ" : "Ответить"}</Button></div></div>;
}
