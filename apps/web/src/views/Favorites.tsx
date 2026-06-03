import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, CardBody, SectionTitle, Button } from "../ui/components";

type Garage = {
  id: number;
  title: string;
  address: string;
  description?: string;
  coverUrl?: string;
  avatarUrl?: string;
  masterName: string;
  ratingAvg: number;
  ratingCount: number;
  minPrice?: number | null;
  servicesList?: string[];
  workSchedule?: string;
};

function readFavorites(): number[] {
  try { return JSON.parse(localStorage.getItem("gm_favorites") || "[]"); } catch { return []; }
}
function saveFavorites(ids: number[]) {
  localStorage.setItem("gm_favorites", JSON.stringify(ids));
}

export default function Favorites() {
  const [garages, setGarages] = useState<Garage[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => readFavorites());
  const [me, setMe] = useState<any>(null);

  async function load() {
    const auth = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({ ok: false }));
    setMe(auth.ok ? auth.user : null);
    if (auth.ok) {
      const fav = await fetch("/api/favorites").then((r) => r.json()).catch(() => ({ ok: false }));
      setGarages(fav.garages ?? []);
      setFavoriteIds((fav.favoriteIds ?? []).map(Number));
    } else {
      const ids = readFavorites();
      setFavoriteIds(ids);
      const all = await fetch("/api/garages?approved=1").then((r) => r.json()).catch(() => ({ garages: [] }));
      setGarages((all.garages ?? []).filter((g: Garage) => ids.includes(g.id)));
    }
  }

  useEffect(() => { load(); }, []);

  const favorites = useMemo(() => garages.filter((g) => me ? true : favoriteIds.includes(g.id)), [garages, favoriteIds, me]);

  async function remove(id: number) {
    if (me) {
      await fetch(`/api/favorites/${id}`, { method: "DELETE" });
      await load();
      return;
    }
    const next = favoriteIds.filter((x) => x !== id);
    saveFavorites(next);
    setFavoriteIds(next);
    setGarages((prev) => prev.filter((g) => g.id !== id));
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Избранное" title="Сохранённые гаражи">
        Здесь остаются мастерские, к которым удобно вернуться позже для записи или сравнения.
      </SectionTitle>

      {favorites.length === 0 ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="text-sm leading-6 text-zinc-400">Пока нет сохранённых мастерских. Открой каталог и нажми звёздочку на подходящем гараже.</div>
            <Link className="inline-flex rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300" to="/search">Перейти в каталог</Link>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {favorites.map((g) => (
            <Card key={g.id} className="group overflow-hidden transition hover:-translate-y-1 hover:border-amber-300/35">
              <div className="relative h-52 overflow-hidden">
                <img src={g.coverUrl || "/images/garage-lada-real.jpg"} alt={g.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute left-3 top-3 flex gap-2">
                  <Badge className="bg-black/60 backdrop-blur">⭐ {Number(g.ratingAvg).toFixed(1)}</Badge>
                  {g.minPrice ? <Badge className="bg-black/60 backdrop-blur">от {g.minPrice} ₽</Badge> : null}
                </div>
              </div>
              <CardBody className="space-y-4">
                <div className="flex items-start gap-3">
                  <img src={g.avatarUrl || "/images/master-ivan.jpg"} alt={g.masterName} className="h-11 w-11 rounded-2xl object-cover ring-1 ring-white/10" />
                  <div>
                    <div className="font-semibold text-zinc-50">{g.title}</div>
                    <div className="text-xs text-zinc-500">{g.masterName} • {g.address}</div>
                  </div>
                </div>
                <div className="text-sm leading-6 text-zinc-400 line-clamp-3">{g.description}</div>
                <div className="flex flex-wrap gap-2">{(g.servicesList ?? []).slice(0, 3).map((s) => <Badge key={s}>{s}</Badge>)}</div>
                <div className="flex items-center justify-between gap-3">
                  <Button type="button" className="bg-white/10 text-zinc-50 shadow-none" onClick={() => remove(g.id)}>Убрать</Button>
                  <Link to={`/garage/${g.id}`} className="rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300">Открыть</Link>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
