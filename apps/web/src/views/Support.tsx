import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Card, CardBody, Input, SectionTitle, Select, Textarea } from "../ui/components";

type Ticket = {
  id: number;
  topic?: string;
  subject: string;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  adminReply?: string;
  createdAt: number;
  updatedAt: number;
};

const topics = ["Проблема с записью", "Проблема с гаражом", "Проблема с отзывом", "Ошибка на сайте", "Модерация", "Другое"];

const statusText: Record<string, string> = {
  OPEN: "Новое",
  IN_PROGRESS: "В работе",
  CLOSED: "Закрыто",
};

function toDate(v: unknown) {
  const n = Number(v);
  const ms = Number.isFinite(n) ? n : Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "";
}

export default function Support() {
  const [me, setMe] = useState<any>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [topic, setTopic] = useState("Проблема с записью");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const auth = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({ ok: false }));
    setMe(auth.ok ? auth.user : null);
    if (auth.ok) {
      const j = await fetch("/api/support/my").then((r) => r.json()).catch(() => ({ ok: false }));
      setTickets(j.tickets ?? []);
    } else {
      setTickets([]);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setSaving(true);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, subject, message }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: "Сервер не ответил" }));
      if (!j.ok) return setErr(j.error ?? "Не удалось отправить обращение");
      setTopic("Проблема с записью");
      setSubject("");
      setMessage("");
      setOk(`Обращение #${j.ticketId} отправлено администратору.`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Поддержка" title="Связь с администратором">
        Здесь пользователь или мастер может оставить обращение: проблема с записью, гаражом, отзывом, профилем или модерацией.
      </SectionTitle>

      {!me ? (
        <Card><CardBody className="text-sm text-zinc-400">Чтобы отправить обращение, войди в аккаунт.</CardBody></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <Card>
            <CardBody>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <div className="text-lg font-semibold text-zinc-50">Новое обращение</div>
                  <div className="mt-1 text-sm text-zinc-500">Администратор увидит заявку в админ-панели и сможет ответить.</div>
                </div>
                <label className="block space-y-2 text-xs text-zinc-400">Категория<Select value={topic} onChange={(e) => setTopic(e.target.value)}>{topics.map((x) => <option key={x} value={x}>{x}</option>)}</Select></label>
                <label className="block space-y-2 text-xs text-zinc-400">Тема<Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Например: не получается оставить отзыв" /></label>
                <label className="block space-y-2 text-xs text-zinc-400">Описание<Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Опиши, что произошло и какой аккаунт/гараж/заявка связаны с проблемой." /></label>
                {err ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{err}</div> : null}
                {ok ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{ok}</div> : null}
                <Button disabled={saving}>{saving ? "Отправляю..." : "Отправить администратору"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <div className="text-lg font-semibold text-zinc-50">Мои обращения</div>
              {tickets.length === 0 ? <div className="text-sm text-zinc-500">Обращений пока нет. Если возникнет проблема с записью, гаражом или отзывом — создайте обращение администратору.</div> : (
                <div className="space-y-3">
                  {tickets.map((t) => (
                    <div key={t.id} className="rounded-3xl border border-white/10 bg-white/[.04] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">#{t.id} • {t.subject}</div>
                          <div className="mt-1 text-xs text-zinc-500">{t.topic || "Другое"} • Создано: {toDate(t.createdAt)}</div>
                        </div>
                        <Badge className={t.status === "CLOSED" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : t.status === "IN_PROGRESS" ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : ""}>{statusText[t.status]}</Badge>
                      </div>
                      <div className="mt-3 text-sm leading-6 text-zinc-400">{t.message}</div>
                      {t.adminReply ? <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100"><span className="font-semibold">Ответ администратора:</span> {t.adminReply}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
