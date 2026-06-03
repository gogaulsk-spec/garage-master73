import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Card, CardBody, Badge, Button, Input, SectionTitle } from "../ui/components";

type Booking = {
  id: number;
  status: "NEW" | "CONFIRMED" | "CANCELLED" | "DONE";
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
  is_approved: number;
  moderationReason?: string;
  servicesCount: number;
  futureSlotsCount: number;
  workSchedule?: string;
};

type NotificationItem = { id: number; type: string; title: string; text?: string; link?: string; readAt?: number | null; createdAt: number };

type FormService = { serviceId: number; checked: boolean; priceFrom: string; durationMin: string };

const defaultForm = {
  title: "",
  address: "",
  description: "",
  phone: "",
  coverUrl: "/images/garage-lada-real.jpg",
  photoUrls: "/images/garage-lada-real.jpg\n/images/garage-lift-clean.jpg",
  workSchedule: "Пн–Сб 10:00–19:00, по записи",
  lat: "",
  lng: "",
  daysAhead: "14",
  startHour: "10",
  endHour: "18",
  slotDurationMin: "60",
};

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE_MB = 8;

function photoList(value: string) {
  return value.split("\n").map((x) => x.trim()).filter(Boolean);
}

function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`Файл ${file.name} не является изображением.`));
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      reject(new Error(`Файл ${file.name} больше ${MAX_FILE_SIZE_MB} МБ.`));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Не удалось прочитать файл ${file.name}.`));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error(`Не удалось обработать изображение ${file.name}.`));
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Браузер не смог подготовить изображение."));
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function Master() {
  const [me, setMe] = useState<any>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [myGarages, setMyGarages] = useState<MasterGarage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, { workSchedule: string; daysAhead: string; startHour: string; endHour: string; slotDurationMin: string }>>({});
  const [scheduleOk, setScheduleOk] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [formServices, setFormServices] = useState<FormService[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
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
      const [br, gr, nr] = await Promise.all([fetch("/api/master/bookings"), fetch("/api/master/garages"), fetch("/api/notifications")]);
      const bj = await br.json();
      const gj = await gr.json();
      const nj = await nr.json();
      const garages = (gj.garages ?? []) as MasterGarage[];
      setBookings(bj.bookings ?? []);
      setMyGarages(garages);
      setNotifications(nj.notifications ?? []);
      setScheduleDrafts((prev) => {
        const next = { ...prev };
        for (const g of garages) {
          if (!next[g.id]) next[g.id] = { workSchedule: g.workSchedule || "По записи", daysAhead: "14", startHour: "10", endHour: "18", slotDurationMin: "60" };
        }
        return next;
      });
    } else {
      setBookings([]);
      setMyGarages([]);
      setNotifications([]);
    }
  }

  useEffect(() => { load(); }, []);

  const groupedServices = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const service of services) {
      if (!map.has(service.category)) map.set(service.category, []);
      map.get(service.category)!.push(service);
    }
    return Array.from(map.entries());
  }, [services]);

  const photos = useMemo(() => photoList(form.photoUrls), [form.photoUrls]);

  async function setStatus(id: number, status: "CONFIRMED" | "CANCELLED" | "DONE") {
    setErr(null);
    const r = await fetch(`/api/master/bookings/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const j = await r.json();
    if (!j.ok) return setErr(j.error ?? "Ошибка");
    await load();
  }

  async function findCoordinates() {
    setFormErr(null);
    setFormOk(null);
    if (form.address.trim().length < 5) {
      setFormErr("Сначала укажи адрес гаража.");
      return null;
    }
    setGeocoding(true);
    try {
      const r = await fetch(`/api/geocode?address=${encodeURIComponent(form.address)}`);
      const j = await r.json();
      if (!j.ok) {
        setFormErr(j.error ?? "Не удалось найти координаты. Можно ввести их вручную.");
        return null;
      }
      setForm((p) => ({ ...p, lat: String(Number(j.lat).toFixed(6)), lng: String(Number(j.lng).toFixed(6)) }));
      setFormOk(`Координаты найдены: ${Number(j.lat).toFixed(6)}, ${Number(j.lng).toFixed(6)}.`);
      return j as { lat: number; lng: number; displayName?: string };
    } finally {
      setGeocoding(false);
    }
  }

  async function handlePhotoFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    e.target.value = "";
    if (files.length === 0) return;

    setUploadingPhotos(true);
    setFormErr(null);
    setFormOk(null);
    try {
      const urls = await Promise.all(files.map(resizeImageFile));
      setForm((p) => ({ ...p, coverUrl: urls[0], photoUrls: urls.join("\n") }));
      setFormOk(`Фото загружены в форму: ${urls.length} шт. Первое фото станет обложкой.`);
    } catch (error) {
      setFormErr(error instanceof Error ? error.message : "Не удалось загрузить фото.");
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function createGarage(e: FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setFormOk(null);

    const selectedServices = formServices
      .filter((x) => x.checked)
      .map((x) => ({
        serviceId: x.serviceId,
        priceFrom: x.priceFrom ? Number(x.priceFrom) : undefined,
        durationMin: x.durationMin ? Number(x.durationMin) : undefined,
      }));

    if (selectedServices.length === 0) return setFormErr("Выбери хотя бы одну услугу.");

    setSaving(true);
    try {
      const r = await fetch("/api/master/garages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          address: form.address,
          description: form.description,
          phone: form.phone,
          coverUrl: form.coverUrl,
          photoUrls: photos,
          workSchedule: form.workSchedule,
          lat: form.lat ? Number(form.lat) : undefined,
          lng: form.lng ? Number(form.lng) : undefined,
          services: selectedServices,
          schedule: {
            daysAhead: Number(form.daysAhead || 14),
            startHour: Number(form.startHour || 10),
            endHour: Number(form.endHour || 18),
            slotDurationMin: Number(form.slotDurationMin || 60),
          },
        }),
      });
      const j = await r.json();
      if (!j.ok) return setFormErr(j.error ?? "Не удалось создать гараж");
      const geoText = j.geocodedAddress ? " Координаты автоматически определены по адресу." : "";
      setFormOk(`Гараж создан. Слотов добавлено: ${j.slotsCreated}. После модерации он появится в каталоге.${geoText}`);
      setForm(defaultForm);
      setFormServices((prev) => prev.map((x) => ({ ...x, checked: false, priceFrom: "", durationMin: "60" })));
      await load();
    } finally {
      setSaving(false);
    }
  }

  function updateService(id: number, patch: Partial<FormService>) {
    setFormServices((prev) => prev.map((item) => (item.serviceId === id ? { ...item, ...patch } : item)));
  }

  function updateScheduleDraft(id: number, patch: Partial<{ workSchedule: string; daysAhead: string; startHour: string; endHour: string; slotDurationMin: string }>) {
    setScheduleDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { workSchedule: "По записи", daysAhead: "14", startHour: "10", endHour: "18", slotDurationMin: "60" }), ...patch },
    }));
  }

  async function saveSchedule(id: number) {
    setErr(null);
    setScheduleOk(null);
    const draft = scheduleDrafts[id];
    if (!draft) return;
    const r = await fetch(`/api/master/garages/${id}/schedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workSchedule: draft.workSchedule,
        daysAhead: Number(draft.daysAhead || 14),
        startHour: Number(draft.startHour || 10),
        endHour: Number(draft.endHour || 18),
        slotDurationMin: Number(draft.slotDurationMin || 60),
      }),
    });
    const j = await r.json();
    if (!j.ok) return setErr(j.error ?? "Не удалось обновить расписание");
    setScheduleOk(`Расписание обновлено. Новых свободных слотов: ${j.slotsCreated}.`);
    await load();
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Кабинет мастера" title="Управление гаражом и заявками">
        Здесь мастер создаёт карточку гаража, добавляет фото, услуги, цены и слоты для записи. Новая карточка уходит на модерацию администратору.
      </SectionTitle>

      <Card>
        <CardBody className="space-y-2">
          {!me ? (
            <div className="text-sm text-zinc-400">Войди в аккаунт мастера, чтобы управлять гаражом и заявками.</div>
          ) : me.role !== "MASTER" ? (
            <div className="text-sm text-zinc-400">Твой аккаунт: {me.role}. Для этой страницы нужен MASTER.</div>
          ) : (
            <div className="flex flex-wrap gap-2"><Badge>MASTER</Badge><Badge>{me.email}</Badge></div>
          )}
          {err && <div className="text-sm text-red-400">{err}</div>}
        </CardBody>
      </Card>

      {me?.role === "MASTER" && notifications.length > 0 ? (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xl font-semibold text-zinc-50">Уведомления</div>
              <Button
                className="bg-white/10 text-zinc-50 shadow-none"
                onClick={async () => { await fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); await load(); }}
              >
                Прочитать всё
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {notifications.slice(0, 4).map((n) => (
                <div key={n.id} className={`rounded-2xl border px-4 py-3 ${n.readAt ? "border-white/10 bg-white/[.04]" : "border-amber-300/25 bg-amber-300/10"}`}>
                  <div className="text-sm font-semibold text-zinc-100">{n.title}</div>
                  {n.text ? <div className="mt-1 text-xs leading-5 text-zinc-400">{n.text}</div> : null}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {me?.role === "MASTER" && (
        <>
          <Card>
            <CardBody className="space-y-5">
              <div>
                <div className="text-xl font-semibold text-zinc-50">Создать гараж</div>
                <div className="mt-1 text-sm text-zinc-500">Заполни данные мастерской, услуги, цены, фотографии и график работы.</div>
              </div>

              <form className="space-y-5" onSubmit={createGarage}>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-xs text-zinc-400">Название гаража<Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Например, Гараж 73" /></label>
                  <label className="space-y-2 text-xs text-zinc-400">Телефон<Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+7 ..." /></label>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs text-zinc-400">Адрес</label>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Ульяновск, район, улица, гараж" />
                    <Button type="button" className="bg-white/10 text-zinc-50 shadow-none" onClick={findCoordinates} disabled={geocoding}>{geocoding ? "Ищу..." : "Найти на карте"}</Button>
                  </div>
                  <div className="text-xs text-zinc-500">Координаты можно не вводить вручную: сайт попробует определить их по адресу.</div>
                </div>

                <label className="block space-y-2 text-xs text-zinc-400">Описание<textarea className="min-h-28 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-50 outline-none focus:border-amber-300/60" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Что делаешь, какие авто берёшь, чем отличаешься" /></label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-xs text-zinc-400">График работы<Input value={form.workSchedule} onChange={(e) => setForm((p) => ({ ...p, workSchedule: e.target.value }))} /></label>
                  <div className="space-y-2 text-xs text-zinc-400">
                    <div>Фото гаража</div>
                    <label className="flex min-h-[46px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-amber-300/35 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/15">
                      {uploadingPhotos ? "Обрабатываю фото..." : "Выбрать фото"}
                      <input className="hidden" type="file" accept="image/*" multiple onChange={handlePhotoFiles} disabled={uploadingPhotos} />
                    </label>
                  </div>
                </div>

                <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[.04] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">Предпросмотр фото</div>
                      <div className="text-xs text-zinc-500">До {MAX_PHOTOS} фото. Первое фото используется как обложка.</div>
                    </div>
                    <Button type="button" className="bg-white/10 text-zinc-50 shadow-none" onClick={() => setForm((p) => ({ ...p, coverUrl: defaultForm.coverUrl, photoUrls: defaultForm.photoUrls }))}>Вернуть демо-фото</Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {photos.map((src, index) => (
                      <div key={`${src.slice(0, 28)}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                        <img src={src} alt={`Фото гаража ${index + 1}`} className="h-28 w-full object-cover" />
                        <div className="px-3 py-2 text-xs text-zinc-400">{index === 0 ? "Обложка" : `Фото ${index + 1}`}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-xs text-zinc-400">Широта<Input value={form.lat} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} placeholder="54.310759" /></label>
                  <label className="space-y-2 text-xs text-zinc-400">Долгота<Input value={form.lng} onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))} placeholder="48.401089" /></label>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-semibold text-zinc-100">Услуги гаража</div>
                  {groupedServices.map(([category, items]) => (
                    <div key={category} className="space-y-2 rounded-3xl border border-white/10 bg-white/[.04] p-4">
                      <div className="text-sm text-amber-200">{category}</div>
                      {items.map((service) => {
                        const current = formServices.find((x) => x.serviceId === service.id) ?? { serviceId: service.id, checked: false, priceFrom: "", durationMin: "60" };
                        return (
                          <div key={service.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_140px] md:items-center">
                            <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={current.checked} onChange={(e) => updateService(service.id, { checked: e.target.checked })} /><span>{service.name}</span></label>
                            <Input type="number" min="0" placeholder="Цена от, ₽" value={current.priceFrom} onChange={(e) => updateService(service.id, { priceFrom: e.target.value })} disabled={!current.checked} />
                            <Input type="number" min="15" step="15" placeholder="Минут" value={current.durationMin} onChange={(e) => updateService(service.id, { durationMin: e.target.value })} disabled={!current.checked} />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="space-y-2 text-xs text-zinc-400">Дней вперёд<Input type="number" min="1" max="60" value={form.daysAhead} onChange={(e) => setForm((p) => ({ ...p, daysAhead: e.target.value }))} /></label>
                  <label className="space-y-2 text-xs text-zinc-400">Начало<Input type="number" min="0" max="23" value={form.startHour} onChange={(e) => setForm((p) => ({ ...p, startHour: e.target.value }))} /></label>
                  <label className="space-y-2 text-xs text-zinc-400">Конец<Input type="number" min="1" max="24" value={form.endHour} onChange={(e) => setForm((p) => ({ ...p, endHour: e.target.value }))} /></label>
                  <label className="space-y-2 text-xs text-zinc-400">Слот, мин<Input type="number" min="30" step="15" max="240" value={form.slotDurationMin} onChange={(e) => setForm((p) => ({ ...p, slotDurationMin: e.target.value }))} /></label>
                </div>

                {formErr && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{formErr}</div>}
                {formOk && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{formOk}</div>}
                <Button type="submit" disabled={saving || uploadingPhotos}>{saving ? "Сохраняю..." : "Создать гараж"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xl font-semibold text-zinc-50">Мои гаражи</div>
                {scheduleOk ? <div className="text-xs text-emerald-200">{scheduleOk}</div> : null}
              </div>
              {myGarages.length === 0 ? <div className="text-sm text-zinc-500">Пока нет гаражей.</div> : (
                <div className="grid gap-3 md:grid-cols-2">
                  {myGarages.map((g) => {
                    const rejected = !g.is_approved && !!g.moderationReason;
                    return (
                      <div key={g.id} className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
                        <img src={g.coverUrl || "/images/garage-lada-real.jpg"} alt={g.title} className="h-36 w-full object-cover" />
                        <div className="space-y-2 p-4">
                          <div className="font-semibold text-zinc-50">{g.title}</div>
                          <div className="text-xs text-zinc-500">{g.address}</div>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={g.is_approved ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : rejected ? "border-red-300/25 bg-red-300/10 text-red-200" : "border-amber-300/25 bg-amber-300/10 text-amber-200"}>{g.is_approved ? "Опубликован" : rejected ? "Отклонён" : "На модерации"}</Badge>
                            <Badge>Услуг: {g.servicesCount}</Badge><Badge>Слотов: {g.futureSlotsCount}</Badge>
                          </div>
                          {rejected ? <div className="rounded-2xl border border-red-400/15 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-100"><span className="font-semibold">Причина отказа:</span> {g.moderationReason}</div> : null}

                          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[.04] p-3">
                            <div className="text-sm font-semibold text-zinc-100">Редактировать расписание</div>
                            <Input value={scheduleDrafts[g.id]?.workSchedule ?? g.workSchedule ?? "По записи"} onChange={(e) => updateScheduleDraft(g.id, { workSchedule: e.target.value })} placeholder="Пн–Сб 10:00–19:00" />
                            <div className="grid gap-2 sm:grid-cols-4">
                              <Input type="number" min="1" max="60" value={scheduleDrafts[g.id]?.daysAhead ?? "14"} onChange={(e) => updateScheduleDraft(g.id, { daysAhead: e.target.value })} title="Дней вперёд" />
                              <Input type="number" min="0" max="23" value={scheduleDrafts[g.id]?.startHour ?? "10"} onChange={(e) => updateScheduleDraft(g.id, { startHour: e.target.value })} title="Начало" />
                              <Input type="number" min="1" max="24" value={scheduleDrafts[g.id]?.endHour ?? "18"} onChange={(e) => updateScheduleDraft(g.id, { endHour: e.target.value })} title="Конец" />
                              <Input type="number" min="30" max="240" step="15" value={scheduleDrafts[g.id]?.slotDurationMin ?? "60"} onChange={(e) => updateScheduleDraft(g.id, { slotDurationMin: e.target.value })} title="Слот, мин" />
                            </div>
                            <Button type="button" className="bg-white/10 text-zinc-50 shadow-none" onClick={() => saveSchedule(g.id)}>Сохранить расписание</Button>
                          </div>
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
              <div className="text-xl font-semibold text-zinc-50">Заявки</div>
              {bookings.length === 0 ? <div className="text-sm text-zinc-500">Пока нет заявок.</div> : (
                <div className="space-y-2">
                  {bookings.map((b) => (
                    <div key={b.id} className="rounded-3xl border border-white/10 bg-white/[.04] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-zinc-100">#{b.id} • {b.serviceName}</div>
                          <div className="text-xs text-zinc-500">{new Date(b.slotStart).toLocaleString()} — {new Date(b.slotEnd).toLocaleTimeString()}</div>
                          <div className="text-xs text-zinc-500">{b.garageTitle} • {b.garageAddress}</div>
                          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                            {b.userAvatarUrl ? <img src={b.userAvatarUrl} alt={b.userDisplayName || b.userEmail || "Клиент"} className="h-7 w-7 rounded-xl object-cover ring-1 ring-white/10" /> : null}
                            <span>Клиент: {b.userDisplayName || b.userEmail || "—"} {b.userPhone ? `• ${b.userPhone}` : ""} {b.userCarInfo ? `• ${b.userCarInfo}` : ""}</span>
                          </div>
                        </div>
                        <Badge>{b.status}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button onClick={() => setStatus(b.id, "CONFIRMED")} disabled={b.status !== "NEW"}>Подтвердить</Button>
                        <Button className="bg-white/10 text-zinc-50 shadow-none" onClick={() => setStatus(b.id, "CANCELLED")} disabled={b.status === "CANCELLED" || b.status === "DONE"}>Отменить</Button>
                        <Button className="bg-white/10 text-zinc-50 shadow-none" onClick={() => setStatus(b.id, "DONE")} disabled={b.status !== "CONFIRMED"}>Завершить</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
