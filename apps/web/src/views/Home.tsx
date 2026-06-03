import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardBody, Button, Input, Badge, SectionTitle } from "../ui/components";

type Garage = {
  id: number;
  title: string;
  address: string;
  description?: string;
  phone?: string;
  coverUrl?: string;
  avatarUrl?: string;
  masterName: string;
  ratingAvg: number;
  ratingCount: number;
  minPrice?: number | null;
  servicesList?: string[];
  workSchedule?: string;
};

type Service = { id: number; category: string; name: string };

const districts = ["Засвияжье", "Центр", "Новый город", "Железнодорожный", "Север", "Нижняя Терраса"];
const popular = ["Автоэлектрика", "Подвеска", "Кузовной ремонт", "Ремонт ВАЗ", "Диагностика", "Покраска"];

export default function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [garages, setGarages] = useState<Garage[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/garages?approved=1").then((r) => r.json()),
      fetch("/api/services").then((r) => r.json()),
    ])
      .then(([g, s]) => {
        setGarages(g.garages ?? []);
        setServices(s.services ?? []);
      })
      .catch(() => {
        setGarages([]);
        setServices([]);
      });
  }, []);

  const top = useMemo(() => garages.slice(0, 3), [garages]);
  const avgRating = useMemo(() => {
    if (!garages.length) return "4.8";
    return (garages.reduce((sum, g) => sum + Number(g.ratingAvg || 0), 0) / garages.length).toFixed(1);
  }, [garages]);

  function submitSearch(value = q) {
    nav(`/search?search=${encodeURIComponent(value)}`);
  }

  return (
    <div className="space-y-12">
      <section className="grid gap-6 lg:grid-cols-[1.05fr_.95fr] lg:items-stretch">
        <Card className="overflow-hidden border-amber-300/15 bg-gradient-to-br from-zinc-950/95 via-zinc-950/70 to-amber-950/20">
          <CardBody className="relative z-10 flex min-h-[520px] flex-col justify-between space-y-9 p-7 md:p-10">
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-200">Ульяновск</Badge>
                <Badge>частные мастера</Badge>
                <Badge>запись онлайн</Badge>
              </div>

              <div className="max-w-3xl space-y-5">
                <h1 className="text-4xl font-black tracking-tight text-zinc-50 md:text-6xl">
                  Мастерские, где чинят по делу
                </h1>
                <p className="max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">
                  GarageMaster помогает найти гаражного мастера по району, услуге, рейтингу и реальным работам: от автоэлектрики и подвески до кузовного ремонта и подготовки классики.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder="Электрика, Лада, подвеска, покраска..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitSearch();
                  }}
                />
                <Button onClick={() => submitSearch()} className="shrink-0 px-6">
                  Найти мастера
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {popular.map((item) => (
                  <button
                    key={item}
                    onClick={() => submitSearch(item)}
                    className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-amber-300/30 hover:bg-amber-300/10 hover:text-amber-100"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat value={garages.length || 4} label="мастерских в каталоге" />
              <Stat value={services.length || 14} label="видов услуг" />
              <Stat value={avgRating} label="средний рейтинг" />
            </div>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <div className="image-noise relative h-full min-h-[520px]">
            <img src="/images/hero-garage.jpg" alt="Гаражная автомастерская" className="h-full w-full object-cover" />
            <div className="absolute bottom-0 left-0 right-0 z-10 p-6">
              <div className="max-w-md rounded-3xl border border-white/10 bg-black/60 p-5 backdrop-blur">
                <div className="text-xl font-semibold text-zinc-50">Свободные слоты, цены и контакты в одной карточке</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Пользователь видит услуги, фото бокса, рейтинг мастера, район и может оставить заявку без долгих переписок.
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-5">
        <SectionTitle eyebrow="Каталог" title="Популярные мастерские">
          Карточки показывают специализацию, цену от, рейтинг, график работы и фотографии гаражного бокса.
        </SectionTitle>

        <div className="grid gap-4 md:grid-cols-3">
          {top.map((g) => (
            <Link key={g.id} to={`/garage/${g.id}`} className="group block">
              <Card className="h-full overflow-hidden transition group-hover:-translate-y-1 group-hover:border-amber-300/40">
                <div className="relative h-52 overflow-hidden">
                  <img src={g.coverUrl || "/images/garage-lada-real.jpg"} alt={g.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute left-3 top-3 flex gap-2">
                    <Badge className="bg-black/60 backdrop-blur">⭐ {Number(g.ratingAvg).toFixed(1)}</Badge>
                    {g.minPrice ? <Badge className="bg-black/60 backdrop-blur">от {g.minPrice} ₽</Badge> : null}
                  </div>
                </div>
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img src={g.avatarUrl || "/images/master-ivan.jpg"} alt={g.masterName} className="h-11 w-11 rounded-2xl object-cover ring-1 ring-white/10" />
                    <div>
                      <div className="font-semibold text-zinc-50">{g.title}</div>
                      <div className="text-xs text-zinc-500">{g.masterName}</div>
                    </div>
                  </div>
                  <div className="text-sm leading-6 text-zinc-400 line-clamp-2">{g.description}</div>
                  <div className="flex flex-wrap gap-2">
                    {(g.servicesList ?? []).slice(0, 3).map((s) => <Badge key={s}>{s}</Badge>)}
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <Card>
          <CardBody className="space-y-5">
            <SectionTitle eyebrow="Районы" title="Поиск рядом с домом" />
            <div className="grid gap-2 sm:grid-cols-2">
              {districts.map((district) => (
                <Link key={district} to={`/search?search=${encodeURIComponent(district)}`} className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-zinc-300 transition hover:border-amber-300/35 hover:text-amber-100">
                  {district}
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-5">
            <SectionTitle eyebrow="Как работает сервис" title="От поиска до заявки" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Process title="Подбор" text="Фильтр по услуге, району, цене и рейтингу." />
              <Process title="Карточка" text="Фото бокса, услуги, график, контакты и свободные слоты." />
              <Process title="Заявка" text="Запись на время и управление статусом в кабинетах." />
            </div>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[.05] p-4">
      <div className="text-3xl font-black text-zinc-50">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function Process({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
      <div className="text-base font-semibold text-zinc-50">{title}</div>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p>
    </div>
  );
}
