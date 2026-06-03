import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardBody, Input, Button } from "../ui/components";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardBody className="space-y-3">
          <div className="text-xl font-semibold">Вход</div>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />

          {err && <div className="text-sm text-red-400">{err}</div>}

          <Button
            className="w-full"
            onClick={async () => {
              setErr(null);
              const r = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
              });
              const j = await r.json();
              if (!j.ok) return setErr(j.error ?? "Ошибка");
              nav("/me");
            }}
          >
            Войти
          </Button>

          <div className="text-xs text-zinc-500">
            Нет аккаунта? <Link className="underline" to="/auth/register">Регистрация</Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
