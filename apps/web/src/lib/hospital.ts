import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';

export type Doctor = {
  id: string; name: string; title: string; qualifications: string; specialization: string;
  departmentId: string; departmentName: string; photoUrl: string; biography: string;
  experienceYears: number; roomNumber: string; consultationFee: number;
  isActive: boolean; isAvailableToday?: boolean; scheduleConfigured: boolean;
  slotDurationMinutes: number; isPublicVisible: boolean;
  weeklySchedule: { day: string; enabled: boolean; slots: { startTime: string; endTime: string }[] }[];
  leaves: { startDate: string; endDate: string; isApproved?: boolean }[];
};
export type Department = { id: string; name: string; description: string; location: string; isActive: boolean };
export type StaffPublic = { id: string; name: string; designation: string; department: string; photoUrl: string; biography: string; shiftTiming: string; workingDays: string[] };
export type Faq = { id: string; question: string; answer: string; isActive: boolean };
export type Settings = {
  hospitalName: string; tagline: string; address: string; mainPhone: string; emergencyHotline: string; email: string;
  bankDetails?: { bankName: string; accountTitle: string; accountNumber: string; iban: string; branchCode: string; instructions: string };
  openingHours?: { emergency: string; opdWeekdays: string; opdSaturday: string; opdSunday: string };
  policies?: { appointmentBookingWindowDays: number; cancellationNoticeHours: number };
};
export type BookingStatus = {
  appointmentId: string; bookingReference: string; patientName: string; patientPhone: string;
  doctorName: string; specialization: string; roomNumber: string; departmentName: string;
  appointmentDate: string; appointmentTime: string; consultationFee: number; paidAmount: number;
  paymentMethodLabel: string; paymentStatus: string; status: string; cancellationReason?: string; createdAt: string;
};

export function useCollection<T extends { id: string }>(name: string) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string }>({ items: [], loading: true, error: '' });
  useEffect(() => {
    return onSnapshot(
      collection(getDb(), name),
      (s) => setState({ items: s.docs.map((d) => ({ ...d.data(), id: d.id }) as unknown as T), loading: false, error: '' }),
      () => setState({ items: [], loading: false, error: 'Could not load this information. Please try again later.' }),
    );
  }, [name]);
  return state;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    return onSnapshot(doc(getDb(), 'hospitalSettings', 'global'), (s) => setSettings(s.exists() ? (s.data() as Settings) : null), () => setSettings(null));
  }, []);
  return settings;
}

export function useBookedTimes(doctorId: string, date: string) {
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    setBooked(new Set());
    if (!doctorId || !date) return;
    const q = query(collection(getDb(), 'slotLocks'), where('doctorId', '==', doctorId), where('date', '==', date));
    return onSnapshot(q, (s) => { setBooked(new Set(s.docs.map((d) => String(d.data().time)))); setReady(true); }, () => setReady(false));
  }, [doctorId, date]);
  return { booked, ready };
}

// ---------- Pakistan time helpers ----------
export function nowKarachi() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}
export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekday = (date: string) => DAYS[new Date(date + 'T00:00:00Z').getUTCDay()];
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, '0');
const to24 = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export function to12h(t: string) {
  const m = toMin(t); const h = Math.floor(m / 60);
  return `${pad(h % 12 || 12)}:${pad(m % 60)} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const prettyDate = (date: string) =>
  new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
export const pkr = (n: number) => `Rs. ${Math.round(n || 0).toLocaleString('en-PK')}`;

/** null = bookable day, otherwise the reason it is not */
export function dayBlockedReason(d: Doctor, date: string, windowDays: number): string | null {
  if (!d.isActive || !d.isPublicVisible) return 'Doctor not available';
  if (!d.scheduleConfigured) return 'Schedule not set';
  const now = nowKarachi();
  if (date < now.date) return 'Past date';
  if (date > addDays(now.date, windowDays)) return 'Outside booking window';
  if (date === now.date && d.isAvailableToday === false) return 'Unavailable today';
  if ((d.leaves || []).some((l) => l.isApproved !== false && date >= l.startDate && date <= l.endDate)) return 'Doctor on leave';
  const day = (d.weeklySchedule || []).find((w) => w.day === weekday(date));
  if (!day || !day.enabled || !day.slots?.length) return 'Not a working day';
  return null;
}

/** all slot start times (HH:mm) for that day, same-day past slots (+30 min buffer) removed */
export function slotsFor(d: Doctor, date: string): string[] {
  const day = (d.weeklySchedule || []).find((w) => w.day === weekday(date));
  if (!day || !day.enabled) return [];
  const dur = d.slotDurationMinutes || 20;
  const now = nowKarachi();
  const out: string[] = [];
  for (const s of day.slots || []) {
    for (let t = toMin(s.startTime); t + dur <= toMin(s.endTime); t += dur) {
      if (date === now.date && t <= now.minutes + 30) continue;
      out.push(to24(t));
    }
  }
  return Array.from(new Set(out)).sort();
}

export function nextAvailableDate(d: Doctor, windowDays: number): string | null {
  const today = nowKarachi().date;
  for (let i = 0; i <= windowDays; i++) {
    const date = addDays(today, i);
    if (!dayBlockedReason(d, date, windowDays) && slotsFor(d, date).length) return date;
  }
  return null;
}

export const lockId = (doctorId: string, date: string, time24: string) => `${doctorId}_${date}_${time24}_1`;

export function randomToken(len = 24) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (x) => a[x % a.length]).join('');
}
export function newBookingRef() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => a[x % a.length]).join('');
  return `CH-${nowKarachi().date.slice(0, 4)}-${r}`;
}
export function clean<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
export function remember(key: string, value: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    if (!list.includes(value)) localStorage.setItem(key, JSON.stringify([value, ...list].slice(0, 20)));
  } catch { /* storage unavailable */ }
}
export function recall(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

// ---------- Banners / offers / reviews ----------
export type Banner = {
  id: string; title: string; subtitle?: string; imageUrl: string; videoUrl?: string;
  ctaText?: string; destinationUrl?: string; startDate: string; expiryDate: string;
  countdownEnd?: string; priority: number; isActive: boolean; placement: string;
};
export type Review = {
  id: string; patientName: string; rating: number; comment: string; doctorName?: string;
  status: string; isPinned: boolean; isVerified?: boolean; reply?: string; createdAt: string;
};

/** Turn a pasted video link into something that can play inside our own page */
export function videoEmbed(url?: string): { kind: 'iframe' | 'file'; src: string } | null {
  const raw = (url || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      if (id) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
    }
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/) || [])[1];
      if (id) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}` };
    }
    if (host.endsWith('facebook.com') || host === 'fb.watch') {
      return { kind: 'iframe', src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false` };
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { kind: 'file', src: raw };
  } catch { /* not a valid URL */ }
  return null;
}

/** Is this banner allowed to show right now (Pakistan date, expiry, countdown)? */
function bannerLive(b: Banner): boolean {
  if (!b.isActive) return false;
  const today = nowKarachi().date;
  if (b.startDate && today < b.startDate) return false;
  if (b.expiryDate && today > b.expiryDate) return false;
  if (b.countdownEnd && Date.now() >= Date.parse(b.countdownEnd)) return false;
  return true;
}

export function useBanners(placement: string) {
  const { items, loading } = useCollection<Banner>('banners');
  const list = items.filter((b) => b.placement === placement && bannerLive(b)).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  return { banners: list, loading };
}

/** Ticking countdown. Returns null on the server / first paint to avoid hydration mismatch. */
export function useCountdown(end?: string) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!end) { setLeft(null); return; }
    const target = Date.parse(end);
    if (Number.isNaN(target)) { setLeft(null); return; }
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [end]);
  return left;
}