import { useEffect, useMemo, useState } from "react";
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

type RejectDialog = { id: number; title: string; wasApproved: boolean } | null;

export default function Admin() {
  const [me, setMe] = useState<any>(null);
  const [garages, setGarages] = useState<Garage[]>([]);
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
      return;
    }
    const j = await fetch("/api/admin/garages").then((r) => r.json());
    if (!j.ok) setErr(j.error ?? "Ошибка загрузки");
    setGarages(j.garages ?? []);
  }

  useEffect(() => { load(); }, []);

  async function moderate(id: number, approved: 0 | 1, reason = "") {
    setErr(null);
    const j = await fetch(`/api/admin/garages/${id}/moderation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved, reason }),
    }).then((r) => r.json());
    if (!j.ok) return setErr(j.error ?? "Ошибка модерации");
    await load();
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
      await moderate(rejecting.id, 0, reason);
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

  const pending = garages.filter((g) => !g.is_approved);
  const approved = garages.filter((g) => g.is_approved);
  const rejected = garages.filter((g) => !g.is_approved && !!g.moderationReason);
  const stats = useMemo(() => ({
    total: garages.length,
    pending: pending.length - rejected.length,
    rejected: rejected.length,
    approved: approved.length,
    services: new Set(garages.flatMap((g) => g.servicesList ?? [])).size,
  }), [garages, pending.length, rejected.length, approved.length]);

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Администрирование" title="Панель управления">
        Администратор проверяет карточки мастерских, управляет публикацией и контролирует качество каталога.
      </SectionTitle>

      <Card>
        <CardBody>
          {!me ? (
            <div className="text-sm text-zinc-400">Для доступа требуется вход в аккаунт администратора.</div>
          ) : me.role !== "ADMIN" ? (
            <div className="text-sm text-zinc-400">Для этой страницы нужны права администратора.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-5">
              <Stat value={stats.total} label="Всего карточек" />
              <Stat value={stats.pending} label="На проверке" />
              <Stat value={stats.rejected} label="Отклонено" />
              <Stat value={stats.approved} label="Опубликовано" />
              <Stat value={stats.services} label="Услуг" />
            </div>
          )}
          {err ? <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{err}</div> : null}
        </CardBody>
      </Card>

      {me?.role === "ADMIN" && (
        <>
          <div className="space-y-3">
            <div className="text-xl font-semibold text-zinc-50">Ожидают проверки и исправления</div>
            {pending.length === 0 ? <Card><CardBody className="text-sm text-zinc-500">Новых карточек нет.</CardBody></Card> : (
              <div className="grid gap-4 md:grid-cols-2">
                {pending.map((g) => <AdminCard key={g.id} garage={g} onApprove={() => moderate(g.id, 1)} onReject={() => openReject(g)} />)}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xl font-semibold text-zinc-50">Опубликованные гаражи</div>
            {approved.length === 0 ? <Card><CardBody className="text-sm text-zinc-500">Опубликованных карточек пока нет.</CardBody></Card> : (
              <div className="grid gap-4 md:grid-cols-2">
                {approved.map((g) => <AdminCard key={g.id} garage={g} onApprove={() => moderate(g.id, 1)} onReject={() => openReject(g)} />)}
              </div>
            )}
          </div>
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
              <label className="block space-y-2 text-xs text-zinc-400">
                Причина для мастера
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Например: добавьте реальные фото гаража, уточните адрес и номер телефона." />
              </label>
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[.04] p-4">
      <div className="text-3xl font-black text-zinc-50">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
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
            <Badge className={garage.is_approved ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : rejected ? "border-red-300/25 bg-red-300/10 text-red-200" : "border-amber-300/25 bg-amber-300/10 text-amber-200"}>
              {garage.is_approved ? "Опубликован" : rejected ? "Отклонён" : "На проверке"}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <img src={garage.avatarUrl || "/images/master-ivan.jpg"} alt={garage.masterName} className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/10" />
            <div className="text-sm text-zinc-300">{garage.masterName}</div>
          </div>

          <div className="text-sm leading-6 text-zinc-400 line-clamp-3">{garage.description}</div>
          {garage.moderationReason ? <div className="rounded-2xl border border-red-400/15 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-100"><span className="font-semibold">Причина:</span> {garage.moderationReason}</div> : null}
          <div className="flex flex-wrap gap-2">{(garage.servicesList ?? []).slice(0, 4).map((s) => <Badge key={s}>{s}</Badge>)}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={onApprove} disabled={!!garage.is_approved}>Опубликовать</Button>
            <Button className="bg-white/10 text-zinc-50 shadow-none" onClick={onReject}>{garage.is_approved ? "Снять с публикации" : "Отклонить"}</Button>
          </div>
        </CardBody>
      </div>
    </Card>
  );
}
