import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { pkr, prettyDate, recall, useSettings, type BookingStatus } from '@/lib/hospital';

const STATUS_NOTE: Record<string, string> = {
  Pending: 'Pending — awaiting confirmation by City Hospital',
  Confirmed: 'Confirmed by City Hospital',
  'Checked In': 'Checked in',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  'No Show': 'Marked as no-show',
};
const PAY_NOTE: Record<string, string> = {
  Unpaid: 'Unpaid — to be paid at the hospital',
  'Pending Verification': 'Payment submitted — awaiting verification (not yet confirmed)',
  Paid: 'Paid (verified by hospital)',
  'Partially Paid': 'Partially paid',
  Rejected: 'Payment could not be verified — please contact the hospital',
  Refunded: 'Refunded',
};

export function ConfirmationPage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const settings = useSettings();
  const [data, setData] = useState<BookingStatus | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>(token ? 'loading' : 'idle');
  const [code, setCode] = useState('');
  const saved = recall('ch_bookings');

  useEffect(() => {
    if (!token) { setState('idle'); setData(null); return; }
    setState('loading');
    return onSnapshot(
      doc(getDb(), 'bookingStatus', token),
      (s) => { if (s.exists()) { setData(s.data() as BookingStatus); setState('idle'); } else { setData(null); setState('missing'); } },
      () => setState('missing'),
    );
  }, [token]);

  if (!token || state === 'missing') {
    return (
      <div>
        {state === 'missing' && <p className="lv-error">We could not find that booking. Please check the link or code.</p>}
        <p className="lv-muted">Open your appointment using the tracking code from your confirmation page.</p>
        <form className="lv-row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) window.location.href = `/appointment-confirmation?t=${encodeURIComponent(code.trim())}`; }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Tracking code" aria-label="Tracking code" />
          <button className="button" type="submit">Open</button>
        </form>
        {saved.length > 0 && (
          <>
            <h3 className="lv-h">Bookings made on this device</h3>
            {saved.map((t) => <p key={t}><Link className="text-link" to={`/appointment-confirmation?t=${t}`}>Open booking {t.slice(0, 6)}…</Link></p>)}
          </>
        )}
      </div>
    );
  }
  if (!data) return <p>Loading your appointment…</p>;

  const link = typeof window !== 'undefined' ? window.location.href : '';
  return (
    <div>
      <div className="lv-noprint">
        <p className="lv-muted">Your appointment request has been received. <b>Save this page link</b> — it is your private tracking page and updates when the hospital confirms:</p>
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Tracking link" />
        <p><button className="button" onClick={() => window.print()}>Print appointment slip</button></p>
      </div>

      <article className="lv-slip">
        <header className="lv-slip-head">
          <h2>{settings?.hospitalName || 'City Hospital'}</h2>
          <p>{settings?.address} {settings?.mainPhone ? `· Tel: ${settings.mainPhone}` : ''}</p>
        </header>
        <h3>APPOINTMENT SLIP</h3>
        <dl>
          <dt>Booking reference</dt><dd><b>{data.bookingReference}</b></dd>
          <dt>Patient</dt><dd>{data.patientName}</dd>
          <dt>Doctor</dt><dd>{data.doctorName} — {data.specialization}</dd>
          <dt>Department / room</dt><dd>{data.departmentName}{data.roomNumber ? ` · ${data.roomNumber}` : ''}</dd>
          <dt>Date</dt><dd>{prettyDate(data.appointmentDate)}</dd>
          <dt>Time</dt><dd>{data.appointmentTime}</dd>
          <dt>Consultation fee</dt><dd>{pkr(data.consultationFee)}</dd>
          <dt>Payment method</dt><dd>{data.paymentMethodLabel}</dd>
          <dt>Payment status</dt><dd>{PAY_NOTE[data.paymentStatus] || data.paymentStatus}{data.paidAmount ? ` (${pkr(data.paidAmount)} received)` : ''}</dd>
          <dt>Appointment status</dt><dd><b>{STATUS_NOTE[data.status] || data.status}</b></dd>
          {data.cancellationReason ? (<><dt>Reason</dt><dd>{data.cancellationReason}</dd></>) : null}
        </dl>
        <ul className="lv-instr">
          <li>Please arrive 15 minutes early and bring this slip and your ID.</li>
          <li>This slip is not proof of confirmation or payment unless the status above says so.</li>
          {settings?.emergencyHotline && <li>For emergencies call {settings.emergencyHotline}. Do not wait for an appointment.</li>}
        </ul>
      </article>
    </div>
  );
}