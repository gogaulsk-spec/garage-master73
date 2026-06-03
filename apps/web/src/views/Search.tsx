import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardBody, Input, Badge, SectionTitle, Select } from "../ui/components";

type Garage = {
  id: number;
  title: string;
  address: string;
  description?: string;
  phone?: string;
  coverUrl?: string;
  avatarUrl?: string;
  is_approved: number;
  masterName: string;
  ratingAvg: number;
  ratingCount: number;
  minPrice?: number | null;
  servicesList?: string[];
  workSchedule?: string;
  lat?: number | null;
  lng?: number | null;
  futureSlotsCount?: number;
};

type Service = { id: number; category: string; name: string };

const districts = ["Все районы", "Засвияжье", "Центр", "Новый город", "Железнодорожный", "Север", "Нижняя Терраса"];

function readFavorites(): number[] {
  try { return JSON.parse(localStorage.getItem("gm_favorites") || "[]"); } catch { return []; }
}
function toggleFavorite(id: number) {
  const items = new Set(readFavorites());
  items.has(id) ? items.delete(id) : items.add(id);
  localStorage.setItem("gm_favorites", JSON.stringify([...items]));
}

export default function Search() {
  const [sp, setSp] = useSearchParams();
  const [garages, setGarages] = useState<Garage[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [favorites, setFavorites] = useState<number[]>(() => readFavorites());
  const [me, setMe] = useState<any>(null);
  const search = sp.get("search") ?? "";
  const serviceId = sp.get("serviceId") ?? "";
  const district = sp.get("district") ?? "";
  const rating = sp.get("rating") ?? "";
  const sort = sp.get("sort") ?? "rating";
  const onlyFree = sp.get("onlyFree") ?? "";

  useEffect(() => {
    fetch("/api/services").then((r) => r.json()).then((j) => setServices(j.services ?? []));
    fetch("/api/auth/me").then((r) => r.json()).then(async (j) => {
      setMe(j.ok ? j.user : null);
      if (j.ok) {
        const fav = await fetch("/api/favorites").then((r) => r.json()).catch(() => ({ ok: false }));
        if (fav.ok) setFavorites((fav.favoriteIds ?? []).map(Number));
      }
    }).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    qs.set("approved", "1");
    if (search) qs.set("search", search);
    if (serviceId) qs.set("serviceId", serviceId);
    if (onlyFree) qs.set("onlyFree", "1");
    fetch(`/api/garages?${qs.toString()}`).then((r) => r.json()).then((j) => setGarages(j.garages ?? []));
  }, [search, serviceId, onlyFree]);

  const grouped = useMemo(() => {
    const m = new Map<string, Service[]>();
    for (const s of services) {
      if (!m.has(s.category)) m.set(s.category, []);
      m.get(s.category)!.push(s);
    }
    return Array.from(m.entries());
  }, [services]);

  const filtered = useMemo(() => {
    const minRating = Number(rating || 0);
    let rows = garages.filter((g) => {
      const okDistrict = !district || district === "Все районы" || g.address.toLowerCase().includes(district.toLowerCase());
      const okRating = !minRating || Number(g.ratingAvg || 0) >= minRating;
      return okDistrict && okRating;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "price") return Number(a.minPrice ?? 999999) - Number(b.minPrice ?? 999999);
      if (sort === "reviews") return Number(b.ratingCount ?? 0) - Number(a.ratingCount ?? 0);
      return Number(b.ratingAvg ?? 0) - Number(a.ratingAvg ?? 0);
    });
    return rows;
  }, [garages, district, rating, sort]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: true });
  }

  async function favoriteClick(id: number) {
    if (me) {
      const exists = favorites.includes(id);
      await fetch(`/api/favorites/${id}`, { method: exists ? "DELETE" : "POST" });
      const fav = await fetch("/api/favorites").then((r) => r.json()).catch(() => ({ ok: false }));
      if (fav.ok) setFavorites((fav.favoriteIds ?? []).map(Number));
      return;
    }
    toggleFavorite(id);
    setFavorites(readFavorites());
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle eyebrow="Каталог" title="Частные автомастерские">
          Поиск по названию, услуге, району, описанию и имени мастера. Карточки показывают фото, рейтинг, цены и специализацию.
        </SectionTitle>
      </div>

      <Card>
        <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Input placeholder="Поиск: электрика, Лада, кузов..." value={search} onChange={(e) => updateParam("search", e.target.value)} />
          <Select value={serviceId} onChange={(e) => updateParam("serviceId", e.target.value)}>
            <option value="">Все услуги</option>
            {grouped.map(([cat, arr]) => (
              <optgroup key={cat} label={cat}>
                {arr.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </optgroup>
            ))}
          </Select>
          <Select value={district} onChange={(e) => updateParam("district", e.target.value)}>
            {districts.map((d) => <option key={d} value={d === "Все районы" ? "" : d}>{d}</option>)}
          </Select>
          <Select value={rating} onChange={(e) => updateParam("rating", e.target.value)}>
            <option value="">Любой рейтинг</option>
            <option value="4.5">от 4.5</option>
            <option value="4.7">от 4.7</option>
            <option value="4.8">от 4.8</option>
          </Select>
          <Select value={sort} onChange={(e) => updateParam("sort", e.target.value)}>
            <option value="rating">Сначала высокий рейтинг</option>
            <option value="price">Сначала дешевле</option>
            <option value="reviews">Сначала больше отзывов</option>
          </Select>
          <button type="button" onClick={() => updateParam("onlyFree", onlyFree ? "" : "1")} className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${onlyFree ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-black/25 text-zinc-300 hover:border-amber-300/35"}`}>
            Только со свободным временем
          </button>
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-4 text-sm text-zinc-500">
        <div>Найдено: <span className="text-zinc-200">{filtered.length}</span></div>
        <Link className="text-amber-200 underline-offset-4 hover:underline" to="/favorites">Открыть избранное</Link>
      </div>


      {filtered.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-zinc-400">Ничего не найдено. Попробуй изменить запрос, услугу или район.</CardBody>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => {
            const isFav = favorites.includes(g.id);
            return (
              <Card key={g.id} className="group overflow-hidden transition hover:-translate-y-1 hover:border-amber-300/35">
                <div className="relative h-56 overflow-hidden">
                  <img src={g.coverUrl || "/images/garage-lada-real.jpg"} alt={g.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    <Badge className="bg-black/60 backdrop-blur">⭐ {Number(g.ratingAvg).toFixed(1)} ({g.ratingCount})</Badge>
                    {g.minPrice ? <Badge className="bg-black/60 backdrop-blur">от {g.minPrice} ₽</Badge> : null}
                    {Number(g.futureSlotsCount ?? 0) > 0 ? <Badge className="bg-black/60 backdrop-blur">слотов: {g.futureSlotsCount}</Badge> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => favoriteClick(g.id)}
                    className="absolute right-3 top-3 rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-zinc-50 backdrop-blur transition hover:bg-amber-400 hover:text-zinc-950"
                  >
                    {isFav ? "★" : "☆"}
                  </button>
                </div>

                <CardBody className="space-y-4">
                  <div className="flex items-start gap-3">
                    <img src={g.avatarUrl || "/images/master-ivan.jpg"} alt={g.masterName} className="h-11 w-11 rounded-2xl object-cover ring-1 ring-white/10" />
                    <div className="min-w-0">
                      <div className="text-lg font-semibold leading-tight text-zinc-50">{g.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">{g.masterName} • {g.address}</div>
                    </div>
                  </div>

                  <div className="text-sm leading-6 text-zinc-400 line-clamp-3">{g.description}</div>

                  <div className="flex flex-wrap gap-2">
                    {(g.servicesList ?? []).slice(0, 4).map((s) => <Badge key={s}>{s}</Badge>)}
                  </div>

                  <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-zinc-500">{g.workSchedule || "По записи"}</div>
                    <div className="flex gap-2">
                      {typeof g.lat === "number" && typeof g.lng === "number" ? (
                        <a href={`https://yandex.ru/maps/?rtext=~${g.lat}%2C${g.lng}&rtt=auto`} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-zinc-200 transition hover:border-amber-300/35 hover:text-amber-100">
                          Маршрут
                        </a>
                      ) : null}
                      <Link to={`/garage/${g.id}`} className="rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300">
                        Открыть
                      </Link>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
