import { Link } from "react-router-dom";
import { Card, CardBody, SectionTitle } from "../ui/components";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SectionTitle eyebrow="404" title="Страница не найдена">
        Такой страницы нет или ссылка устарела. Вернись в каталог и выбери подходящую мастерскую.
      </SectionTitle>
      <Card>
        <CardBody className="flex flex-wrap gap-3">
          <Link to="/" className="rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300">На главную</Link>
          <Link to="/search" className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-amber-300/35">В каталог</Link>
        </CardBody>
      </Card>
    </div>
  );
}
