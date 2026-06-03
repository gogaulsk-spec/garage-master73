import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, CardBody, SectionTitle } from "../ui/components";

type Garage = {
  id: number;
  title: string;
  address: string;
  description?: string;
  coverUrl?: string;
  avatarUrl?: string;
  masterName: string;
  masterAbout?: string;
  ratingAvg: number;
  ratingCount: number;
  minPrice?: number | null;
  servicesList?: string[];
  workSchedule?: string;
};

const posts = [
  {
    title: "Диагностика электрики на ВАЗ-2107",
    text: "Нашли пропадающую массу, восстановили проводку под капотом и проверили зарядку генератора. Машина снова заводится стабильно.",
    result: "2 часа работы",
    price: "от 2 500 ₽",
    before: "/images/garage-lada-real.jpg",
    after: "/images/garage-lift-clean.jpg",
  },
  {
    title: "Подвеска и тормоза без лишних замен",
    text: "Проверили ходовую, заменили изношенные сайлентблоки и обслужили тормозные механизмы. Клиент получил список того, что можно отложить.",
    result: "1 день",
    price: "от 4 000 ₽",
    before: "/images/garage-lift-clean.jpg",
    after: "/images/garage-lada-real.jpg",
  },
  {
    title: "Кузовной ремонт и сварка порога",
    text: "Зачистка металла, локальная сварка, подготовка под грунт и покраску. Сделали аккуратно, без замены лишних элементов.",
    result: "2 дня",
    price: "от 8 000 ₽",
    before: "/images/garage-bodyshop.jpg",
    after: "/images/garage-premium-dark.jpg",
  },
  {
    title: "Подготовка классики к зимней езде",
    text: "Проверили редуктор, подвеску, тормоза и крепёж. Отдельно настроили поведение машины под активную зимнюю эксплуатацию.",
    result: "по записи",
    price: "от 5 500 ₽",
    before: "/images/garage-premium-dark.jpg",
    after: "/images/garage-lada-real.jpg",
  },
];

export default function Feed() {
  const [garages, setGarages] = useState<Garage[]>([]);

  useEffect(() => {
    fetch("/api/garages?approved=1")
      .then((r) => r.json())
      .then((j) => setGarages(j.garages ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Лента работ" title="Свежие работы мастеров">
        Лента помогает увидеть реальный формат мастерской, специализацию мастера, фото бокса и примеры выполненных работ.
      </SectionTitle>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {garages.map((g, idx) => {
            const post = posts[idx % posts.length];
            return (
              <Card key={g.id} className="overflow-hidden">
                <CardBody className="space-y-4">
                  <div className="flex items-start gap-3">
                    <img src={g.avatarUrl || "/images/master-ivan.jpg"} alt={g.masterName} className="h-12 w-12 rounded-2xl object-cover ring-1 ring-white/10" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-zinc-50">{g.masterName}</div>
                        <Badge>⭐ {Number(g.ratingAvg).toFixed(1)} • {g.ratingCount}</Badge>
                        {g.workSchedule ? <Badge>{g.workSchedule}</Badge> : null}
                      </div>
                      <div className="text-xs text-zinc-500">{g.title} • {g.address}</div>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-semibold text-zinc-50">{post.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{post.text}</p>
                  </div>

                  <Link to={`/garage/${g.id}`} className="group grid gap-3 overflow-hidden rounded-3xl border border-white/10 bg-black/30 md:grid-cols-2">
                    <div className="relative h-64 overflow-hidden">
                      <img src={post.before} alt="До ремонта" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                      <Badge className="absolute left-3 top-3 bg-black/60 backdrop-blur">До</Badge>
                    </div>
                    <div className="relative h-64 overflow-hidden">
                      <img src={post.after} alt="После ремонта" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                      <Badge className="absolute left-3 top-3 bg-black/60 backdrop-blur">После</Badge>
                    </div>
                  </Link>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{post.result}</Badge>
                    <Badge>{post.price}</Badge>
                    {(g.servicesList ?? []).slice(0, 4).map((s) => <Badge key={s}>{s}</Badge>)}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <Card>
            <CardBody className="space-y-3">
              <div className="text-lg font-semibold text-zinc-50">Направления работ</div>
              <div className="flex flex-wrap gap-2">
                {["ВАЗ", "Нива", "электрика", "подвеска", "кузовщина", "покраска", "шиномонтаж", "тюнинг"].map((x) => <Badge key={x}>{x}</Badge>)}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3">
              <div className="text-lg font-semibold text-zinc-50">Быстрый переход</div>
              <div className="grid gap-2">
                <Link className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-zinc-300 hover:border-amber-300/30 hover:text-amber-100" to="/search">Каталог мастерских</Link>
                <Link className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-zinc-300 hover:border-amber-300/30 hover:text-amber-100" to="/favorites">Избранные гаражи</Link>
                <Link className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-zinc-300 hover:border-amber-300/30 hover:text-amber-100" to="/master">Кабинет мастера</Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
