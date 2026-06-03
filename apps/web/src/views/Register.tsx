import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardBody, Input, Button } from "../ui/components";

export default function Register() {
  const nav = useNavigate();
  const [role, setRole] = useState<"USER" | "MASTER">("USER");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [personalDataConsent, setPersonalDataConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!personalDataConsent) {
      setErr("Для регистрации нужно согласие на обработку персональных данных.");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, email, password, displayName: displayName || undefined, personalDataConsent }),
      });
      const j = await r.json();
      if (!j.ok) return setErr(j.error ?? "Ошибка");
      nav("/me");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <div className="text-xl font-semibold text-zinc-50">Регистрация</div>
            <div className="mt-1 text-sm text-zinc-500">Создай аккаунт клиента или мастера для работы с заявками и карточками гаражей.</div>
          </div>

          <form className="space-y-3" onSubmit={submit}>
            <label className="block space-y-2 text-xs text-zinc-400">
              Роль
              <select
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-50 outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/15"
                value={role}
                onChange={(e) => setRole(e.target.value as "USER" | "MASTER")}
              >
                <option value="USER">Пользователь</option>
                <option value="MASTER">Мастер</option>
              </select>
            </label>

            <label className="block space-y-2 text-xs text-zinc-400">
              Email
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" inputMode="email" autoComplete="email" />
            </label>

            {role === "MASTER" && (
              <label className="block space-y-2 text-xs text-zinc-400">
                Имя мастера
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Например, Иван Сафонов" autoComplete="name" />
              </label>
            )}

            <label className="block space-y-2 text-xs text-zinc-400">
              Пароль
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 6 символов" type="password" autoComplete="new-password" />
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-sm leading-6 text-zinc-300">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-amber-400"
                checked={personalDataConsent}
                onChange={(e) => setPersonalDataConsent(e.target.checked)}
                required
              />
              <span>
                Я согласен на обработку персональных данных и принимаю условия страницы <Link className="text-amber-200 underline-offset-4 hover:underline" to="/privacy">«Персональные данные»</Link>.
              </span>
            </label>

            {err && <div className="rounded-2xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-200">{err}</div>}

            <Button className="w-full" disabled={loading || !personalDataConsent} type="submit">
              {loading ? "Создаю аккаунт..." : "Создать аккаунт"}
            </Button>
          </form>

          <div className="text-xs text-zinc-500">
            Уже есть аккаунт? <Link className="text-zinc-300 underline-offset-4 hover:text-amber-200 hover:underline" to="/auth/login">Войти</Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
