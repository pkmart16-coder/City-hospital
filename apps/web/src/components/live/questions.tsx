import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { clean, randomToken, recall, remember, useCollection, useSettings, type Doctor, type Faq, type Review } from '@/lib/hospital';

function AskForm() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBad(true);
    if (name.trim().length < 2) return setMsg('Please enter your name.');
    if (!/^(\+92|0092|0)?\d{9,11}$/.test(phone.replace(/[\s-]/g, ''))) return setMsg('Please enter a valid phone number.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return setMsg('Please enter a valid email or leave it empty.');
    if (message.trim().length < 10) return setMsg('Please write your question (at least 10 characters).');
    setBusy(true);
    try {
      const id = randomToken();
      await setDoc(doc(getDb(), 'inquiries', id), clean({
        id, name: name.trim(), phone: phone.trim(), email: email.trim() || undefined,
        message: message.trim(), status: 'New', createdAt: new Date().toISOString(),
      }));
      remember('ch_questions', id);
      setName(''); setPhone(''); setEmail(''); setMessage('');
      setBad(false);
      setMsg('Thank you. Your question was sent. The reply will appear below on this device.');
    } catch {
      setMsg('Your question could not be sent. Please try again or call the hospital.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="lv-form" onSubmit={send}>
      <h3 className="lv-h">Ask the hospital a question</h3>
      <p className="lv-muted">Do not use this form for emergencies. Do not share sensitive medical details here.</p>
      <label className="lv-label">Name *<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
      <label className="lv-label">Mobile number *<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
      <label className="lv-label">Email (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="lv-label">Your question *<textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} /></label>
      {msg && <p className={bad ? 'lv-error' : 'lv-ok'} role="status">{msg}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send question'}</button>
    </form>
  );
}

type Q = { id: string; message: string; status: string; reply?: string; repliedAt?: string; createdAt: string };

function MyQuestion({ id }: { id: string }) {
  const [q, setQ] = useState<Q | null>(null);
  useEffect(() => onSnapshot(doc(getDb(), 'inquiries', id), (s) => setQ(s.exists() ? (s.data() as Q) : null), () => setQ(null)), [id]);
  if (!q) return null;
  return (
    <div className="lv-card">
      <small>Your question · {q.createdAt.slice(0, 10)}</small>
      <span>{q.message}</span>
      {q.reply ? <div className="lv-reply"><b>Hospital reply</b><p>{q.reply}</p></div> : <small>Awaiting reply from the hospital.</small>}
    </div>
  );
}

function MyQuestions() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => setIds(recall('ch_questions')), []);
  if (!ids.length) return null;
  return (<section><h3 className="lv-h">Your questions on this device</h3>{ids.map((i) => <MyQuestion key={i} id={i} />)}</section>);
}

export function ContactPage() {
  const s = useSettings();
  return (
    <div>
      {s ? (
        <div className="lv-card">
          <strong>{s.hospitalName}</strong>
          <span>{s.address}</span>
          <span>Phone: {s.mainPhone}</span>
          <span>Emergency: {s.emergencyHotline}</span>
          <span>Email: {s.email}</span>
          {s.openingHours && (<><small>OPD weekdays: {s.openingHours.opdWeekdays}</small><small>Saturday: {s.openingHours.opdSaturday}</small><small>Sunday: {s.openingHours.opdSunday}</small><small>Emergency: {s.openingHours.emergency}</small></>)}
        </div>
      ) : <div className="setup"><p>Contact details have not been published yet.</p></div>}
      <AskForm />
      <MyQuestions />
    </div>
  );
}

const DEFAULT_FAQ: [string, string][] = [
  ['What should I bring?', 'Bring identification, your previous medical reports, a current medication list and any relevant referral.'],
  ['Can I book without an account?', 'Yes. No account or login is needed. You will receive a private tracking link for your booking.'],
  ['Is online booking suitable for emergencies?', 'No. Do not use online booking for a medical emergency. Seek immediate local emergency assistance.'],
  ['When is payment confirmed?', 'Payment is only marked paid after the hospital receives or verifies it. Uploading a receipt is not proof of payment.'],
];

export function FaqPage() {
  const { items } = useCollection<Faq>('faqs');
  const list: [string, string][] = [...DEFAULT_FAQ, ...items.filter((f) => f.isActive).map((f) => [f.question, f.answer] as [string, string])];
  return (
    <div>
      <div className="faq">{list.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      <AskForm />
      <MyQuestions />
    </div>
  );
}

export function PaymentPage() {
  const s = useSettings();
  const b = s?.bankDetails;
  if (!b) return <div className="setup"><h2>Payment instructions</h2><p>The hospital has not published bank details yet. Do not send any payment until official instructions appear here. You can always pay at the hospital.</p></div>;
  return (
    <div className="lv-card">
      <strong>Bank transfer details</strong>
      <span>Bank: {b.bankName}</span><span>Account title: {b.accountTitle}</span>
      <span>Account number: {b.accountNumber}</span><span>IBAN: {b.iban}</span><span>Branch: {b.branchCode}</span>
      <small>{b.instructions}</small>
      <small>A transfer is only counted after the hospital verifies it. Submit your reference number while booking.</small>
    </div>
  );
}

function StarsView({ n }: { n: number }) {
  return <span className="lv-stars" role="img" aria-label={`${n} out of 5 stars`}>{'★'.repeat(n)}<i>{'★'.repeat(5 - n)}</i></span>;
}

export function ReviewsPage() {
  const { items: doctors } = useCollection<Doctor>('doctors');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState(false);

  useEffect(() => {
    const q = query(collection(getDb(), 'reviews'), where('status', '==', 'Approved'));
    return onSnapshot(q, (s) => {
      const list = s.docs.map((d) => ({ ...d.data(), id: d.id }) as unknown as Review);
      list.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || (b.createdAt || '').localeCompare(a.createdAt || ''));
      setReviews(list);
      setLoaded(true);
    }, () => setLoaded(true));
  }, []);

  const avg = reviews.length ? reviews.reduce((t, r) => t + r.rating, 0) / reviews.length : 0;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBad(true);
    try {
      const last = Number(localStorage.getItem('ch_review_at') || 0);
      if (last && Date.now() - last < 24 * 60 * 60 * 1000) return setMsg('You have already sent a review recently. Thank you!');
    } catch { /* storage unavailable */ }
    if (name.trim().length < 2) return setMsg('Please enter your name.');
    if (rating < 1) return setMsg('Please choose a star rating.');
    if (comment.trim().length < 10) return setMsg('Please write at least 10 characters.');
    setBusy(true);
    try {
      const id = randomToken();
      await setDoc(doc(getDb(), 'reviews', id), clean({
        id, patientName: name.trim(), rating, comment: comment.trim(),
        doctorName: doctorName || undefined, status: 'Pending', isPinned: false, isVerified: false,
        createdAt: new Date().toISOString(),
      }));
      try { localStorage.setItem('ch_review_at', String(Date.now())); } catch { /* storage unavailable */ }
      setName(''); setRating(0); setComment(''); setDoctorName('');
      setBad(false);
      setMsg('Thank you! Your review was sent and will appear after the hospital approves it.');
    } catch {
      setMsg('Your review could not be sent. Please try again later.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loaded && reviews.length > 0 && (
        <p className="lv-avg"><b>{avg.toFixed(1)}</b> <StarsView n={Math.round(avg)} /> <span>from {reviews.length} review{reviews.length === 1 ? '' : 's'}</span></p>
      )}
      {loaded && !reviews.length && <div className="setup"><p>No reviews yet. Be the first to share your experience.</p></div>}
      <div className="lv-grid">
        {reviews.map((r) => (
          <article key={r.id} className="lv-card">
            <span className="lv-rv-head"><StarsView n={r.rating} />{r.isPinned && <em>Featured</em>}{r.isVerified && <em>Verified patient</em>}</span>
            <span>{r.comment}</span>
            <small>— {r.patientName}{r.doctorName ? ` · about ${r.doctorName}` : ''} · {r.createdAt.slice(0, 10)}</small>
            {r.reply && <div className="lv-reply"><b>Reply from the hospital</b><p>{r.reply}</p></div>}
          </article>
        ))}
      </div>

      <form className="lv-form" onSubmit={send}>
        <h3 className="lv-h">Share your experience</h3>
        <p className="lv-muted">Please share only your own honest experience. Do not include medical details or phone numbers. Reviews are published after the hospital approves them.</p>
        <label className="lv-label">Your name *<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
        <div className="lv-label">Rating *
          <div className="lv-rate" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>
            ))}
          </div>
        </div>
        <label className="lv-label">Doctor (optional)
          <select value={doctorName} onChange={(e) => setDoctorName(e.target.value)}>
            <option value="">Not about a specific doctor</option>
            {doctors.filter((d) => d.isActive && d.isPublicVisible).map((d) => <option key={d.id} value={`${d.title} ${d.name}`.trim()}>{d.title} {d.name}</option>)}
          </select>
        </label>
        <label className="lv-label">Your review *<textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={800} /></label>
        {msg && <p className={bad ? 'lv-error' : 'lv-ok'} role="status">{msg}</p>}
        <button className="button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Submit review'}</button>
      </form>
    </div>
  );
}