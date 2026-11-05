import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { useBanners, useCountdown, videoEmbed, type Banner } from '@/lib/hospital';

function Countdown({ end }: { end?: string }) {
  const left = useCountdown(end);
  if (!end || left === null) return null;
  if (left <= 0) return <p className="lv-count">Offer ended</p>;
  const s = Math.floor(left / 1000);
  const parts: [number, string][] = [[Math.floor(s / 86400), 'days'], [Math.floor((s % 86400) / 3600), 'hrs'], [Math.floor((s % 3600) / 60), 'min'], [s % 60, 'sec']];
  return (
    <p className="lv-count" aria-label="Time left for this offer">
      {parts.map(([n, label]) => (<span key={label}><b>{String(n).padStart(2, '0')}</b><small>{label}</small></span>))}
    </p>
  );
}

function Media({ b }: { b: Banner }) {
  const v = videoEmbed(b.videoUrl);
  if (v?.kind === 'iframe') {
    return (
      <div className="lv-video">
        <iframe src={v.src} title={b.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }
  if (v?.kind === 'file') {
    return <div className="lv-video"><video src={v.src} poster={b.imageUrl || undefined} controls playsInline preload="metadata" /></div>;
  }
  return b.imageUrl ? <img src={b.imageUrl} alt={b.title} className="lv-offer-img" loading="lazy" /> : null;
}

function Cta({ b, onClick }: { b: Banner; onClick?: () => void }) {
  let url = (b.destinationUrl || '').trim();
  if (!b.ctaText || !url) return null;
  if (url === '/appointments') url = '/book-appointment';
  if (url.startsWith('/')) return <Link className="button" to={url} onClick={onClick}>{b.ctaText}</Link>;
  if (/^https?:\/\//i.test(url)) return <a className="button" href={url} target="_blank" rel="noopener noreferrer" onClick={onClick}>{b.ctaText}</a>;
  return null;
}

/** Offers section shown at the very top of the home page */
export function HomeOffers() {
  const { banners } = useBanners('Home Hero');
  if (!banners.length) return null;
  return (
    <section className="lv-offers" aria-label="Current offers">
      {banners.map((b) => (
        <article key={b.id} className="lv-offer">
          <Media b={b} />
          <div className="lv-offer-body">
            <h2>{b.title}</h2>
            {b.subtitle && <p>{b.subtitle}</p>}
            <Countdown end={b.countdownEnd} />
            <Cta b={b} />
          </div>
        </article>
      ))}
    </section>
  );
}

const HOURS = 24 * 60 * 60 * 1000;

/** Popup banner: shows the highest-priority live popup, at most once per day per visitor */
export function PopupBanner() {
  const { banners } = useBanners('Popup Modal');
  const [open, setOpen] = useState<Banner | null>(null);

  useEffect(() => {
    if (open || !banners.length) return;
    let pick: Banner | null = null;
    for (const b of banners) {
      try {
        const last = Number(localStorage.getItem(`ch_popup_${b.id}`) || 0);
        if (!last || Date.now() - last > HOURS) { pick = b; break; }
      } catch { pick = b; break; }
    }
    if (!pick) return;
    const chosen = pick;
    const t = setTimeout(() => setOpen(chosen), 1500);
    return () => clearTimeout(t);
  }, [banners, open]);

  const close = () => {
    if (open) { try { localStorage.setItem(`ch_popup_${open.id}`, String(Date.now())); } catch { /* storage unavailable */ } }
    setOpen(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // if the offer expires while the popup is open, close it
  const left = useCountdownGuard(open);
  if (!open || left) return null;

  return (
    <div className="lv-pop" role="dialog" aria-modal="true" aria-label={open.title} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="lv-pop-card">
        <button type="button" className="lv-pop-x" onClick={close} aria-label="Close"><X size={20} /></button>
        <Media b={open} />
        <div className="lv-offer-body">
          <h2>{open.title}</h2>
          {open.subtitle && <p>{open.subtitle}</p>}
          <Countdown end={open.countdownEnd} />
          <Cta b={open} onClick={close} />
        </div>
      </div>
    </div>
  );
}

function useCountdownGuard(b: Banner | null) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!b?.countdownEnd) return;
    const target = Date.parse(b.countdownEnd);
    const t = setInterval(() => { if (Date.now() >= target) setExpired(true); }, 1000);
    return () => clearInterval(t);
  }, [b]);
  return expired;
}