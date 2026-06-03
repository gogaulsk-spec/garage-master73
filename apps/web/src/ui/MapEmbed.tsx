type MapEmbedProps = {
  lat?: number | null;
  lng?: number | null;
  title?: string;
  address?: string;
  heightClassName?: string;
};

const DEFAULT_LAT = 54.3187;
const DEFAULT_LNG = 48.3978;

function validCoord(lat?: number | null, lng?: number | null) {
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
}

function osmEmbedUrl(lat: number, lng: number) {
  const delta = 0.012;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function osmOpenUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

function routeUrl(lat: number, lng: number) {
  return `https://yandex.ru/maps/?rtext=~${lat}%2C${lng}&rtt=auto`;
}

export default function MapEmbed({ lat, lng, title = "Точка на карте", address, heightClassName = "h-72" }: MapEmbedProps) {
  const hasPoint = validCoord(lat, lng);
  const mapLat = hasPoint ? Number(lat) : DEFAULT_LAT;
  const mapLng = hasPoint ? Number(lng) : DEFAULT_LNG;

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">{title}</div>
          <div className="mt-1 text-xs leading-5 text-zinc-500">
            {hasPoint ? address || `${mapLat.toFixed(5)}, ${mapLng.toFixed(5)}` : "Для точной метки укажи координаты гаража в кабинете мастера."}
          </div>
        </div>
        {hasPoint ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <a className="rounded-2xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-zinc-200 transition hover:border-amber-300/40 hover:text-amber-100" href={osmOpenUrl(mapLat, mapLng)} target="_blank" rel="noreferrer">
              Открыть карту
            </a>
            <a className="rounded-2xl bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300" href={routeUrl(mapLat, mapLng)} target="_blank" rel="noreferrer">
              Маршрут
            </a>
          </div>
        ) : null}
      </div>
      <iframe
        title={title}
        src={osmEmbedUrl(mapLat, mapLng)}
        className={`w-full ${heightClassName}`}
        loading="lazy"
      />
    </div>
  );
}
