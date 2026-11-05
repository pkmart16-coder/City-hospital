import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { doc, runTransaction } from 'firebase/firestore';
import { ref as sref, uploadBytes } from 'firebase/storage';
import { getBucket, getDb, STORAGE_BUCKET } from '@/lib/firebase';
import {
  addDays, clean, dayBlockedReason, lockId, newBookingRef, nowKarachi, pkr, prettyDate, randomToken, remember,
  slotsFor, to12h, useBookedTimes, useCollection, useSettings, weekday, type Department, type Doctor,
} from '@/lib/hospital';

const STEPS = ['Doctor', 'Date & time', 'Your details', 'Payment & review'];

export function BookingPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { items: allDoctors, loading, error: loadError } = useCollection<Doctor>('doctors');
  const { items: departments } = useCollection<Department>('departments');
  const settings = useSettings();
  const windowDays = settings?.policies?.appointmentBookingWindowDays || 30;

  const doctors = useMemo(() => allDoctors.filter((d) => d.isActive && d.isPublicVisible), [allDoctors]);
  const [step, setStep] = useState(1);
  const [deptId, setDeptId] = useState('');
  const [doctorId, setDoctorId] = useState(params.get('doctor') || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [notes, setNotes] = useState('');
  const [payMode, setPayMode] = useState<'onsite' | 'bank'>('onsite');
  const [txnRef, setTxnRef] = useState('');
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const doctor = doctors.find((d) => d.id === doctorId);
  const { booked, ready } = useBookedTimes(doctorId, date);
  const today = nowKarachi().date;
  const days = Array.from({ length: windowDays + 1 }, (_, i) => addDays(today, i));
  const times = doctor && date ? slotsFor(doctor, date) : [];
  const shownDoctors = doctors.filter((d) => !deptId || d.departmentId === deptId);
  const fee = doctor?.consultationFee || 0;

  function next() {
    setError('');
    if (step === 1 && !doctor) return setError('Please choose a doctor.');
    if (step === 2) {
      if (!date) return setError('Please choose a date.');
      if (!time) return setError('Please choose a time slot.');
    }
    if (step === 3) {
      const p = phone.replace(/[\s-]/g, '');
      if (name.trim().length < 3) return setError('Please enter the patient’s full name.');
      if (!/^(\+92|0092|0)?\d{9,11}$/.test(p)) return setError('Please enter a valid phone number.');
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid email address or leave it empty.');
      if (age && (Number(age) < 0 || Number(age) > 120)) return setError('Please enter a valid age.');
    }
    setStep(step + 1);
  }

  async function submit() {
    if (submitting || !doctor) return;
    setError('');
    if (payMode === 'bank') {
      if (txnRef.trim().length < 4) return setError('Please enter the bank transaction/reference number.');
      if (!(Number(amount || fee) > 0)) return setError('Please enter the amount you transferred.');
      if (receipt && (!receipt.type.startsWith('image/') || receipt.size > 5 * 1024 * 1024)) return setError('Receipt must be an image under 5 MB.');
    }
    if (!agree) return setError('Please accept the terms to continue.');

    setSubmitting(true);
    try {
      const db = getDb();
      const token = randomToken();
      const aptId = `apt-web-${Date.now()}-${randomToken(6)}`;
      const payId = `pay-web-${Date.now()}-${randomToken(6)}`;
      const reference = newBookingRef();
      const lid = lockId(doctor.id, date, time);
      const nowIso = new Date().toISOString();
      const bank = payMode === 'bank';

      let proofImageUrl: string | undefined;
      if (bank && receipt) {
        const ext = (receipt.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
        const path = `paymentReceipts/${aptId}/${randomToken(16)}.${ext}`;
        await uploadBytes(sref(getBucket(), path), receipt, { contentType: receipt.type });
        proofImageUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
      }

      const appointment = clean({
        id: aptId, bookingReference: reference,
        patientName: name.trim(), patientPhone: phone.trim(),
        patientEmail: email.trim() || undefined, patientAge: age ? Number(age) : undefined,
        patientGender: gender || undefined,
        doctorId: doctor.id, doctorName: `${doctor.title} ${doctor.name}`.trim(),
        departmentId: doctor.departmentId, departmentName: doctor.departmentName,
        appointmentDate: date, appointmentTime: to12h(time), timeKey: time,
        consultationFee: fee, paidAmount: 0,
        paymentStatus: bank ? 'Pending Verification' : 'Unpaid',
        paymentMethod: bank ? 'Bank Transfer' : 'Cash',
        paymentReference: bank ? txnRef.trim() : undefined,
        status: 'Pending', source: 'Online Public',
        publicToken: token, slotLockIds: [lid], patientNotes: notes.trim() || undefined,
        createdAt: nowIso, updatedAt: nowIso,
      });
      const statusDoc = {
        appointmentId: aptId, bookingReference: reference,
        patientName: name.trim(), patientPhone: phone.trim(),
        doctorName: appointment.doctorName, specialization: doctor.specialization,
        roomNumber: doctor.roomNumber || '', departmentName: doctor.departmentName,
        appointmentDate: date, appointmentTime: to12h(time),
        consultationFee: fee, paidAmount: 0,
        paymentMethodLabel: bank ? 'Bank transfer' : 'Pay at hospital',
        paymentStatus: appointment.paymentStatus, status: 'Pending', cancellationReason: '',
        createdAt: nowIso, updatedAt: nowIso,
      };

      await runTransaction(db, async (tx) => {
        const lockRef = doc(db, 'slotLocks', lid);
        if ((await tx.get(lockRef)).exists()) throw new Error('SLOT_TAKEN');
        tx.set(lockRef, { doctorId: doctor.id, date, time, seat: 1, appointmentId: aptId, createdAt: nowIso });
        tx.set(doc(db, 'appointments', aptId), appointment);
        tx.set(doc(db, 'bookingStatus', token), statusDoc);
        if (bank) {
          tx.set(doc(db, 'paymentSubmissions', payId), clean({
            id: payId, appointmentId: aptId, bookingReference: reference,
            patientName: name.trim(), patientPhone: phone.trim(), doctorName: appointment.doctorName,
            amountExpected: fee, amountPaid: Number(amount || fee),
            bankName: bankName.trim() || 'Not specified', transactionReference: txnRef.trim(),
            proofImageUrl, status: 'Pending Verification', submittedAt: nowIso,
          }));
        }
      });

      remember('ch_bookings', token);
      nav(`/appointment-confirmation?t=${token}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'SLOT_TAKEN') {
        setTime('');
        setStep(2);
        setError('Sorry, that time was just booked by someone else. Please choose another slot.');
      } else {
        setError('We could not complete your booking. Nothing was reserved. Please try again or call the hospital.');
      }
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading doctors…</p>;
  if (loadError) return <div className="setup"><h2>Booking unavailable</h2><p>{loadError}</p></div>;
  if (!doctors.length) return <div className="setup"><h2>Appointments are not open yet</h2><p>The hospital has not published any doctors yet. Please check back soon or contact the hospital directly.</p></div>;

  const bd = settings?.bankDetails;
  return (
    <div className="lv-book">
      <ol className="lv-steps" aria-label="Booking steps">
        {STEPS.map((s, i) => <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>{i + 1}. {s}</li>)}
      </ol>
      {error && <p className="lv-error" role="alert">{error}</p>}

      {step === 1 && (
        <section>
          <label className="lv-label">Department
            <select value={deptId} onChange={(e) => { setDeptId(e.target.value); setDoctorId(''); }}>
              <option value="">All departments</option>
              {departments.filter((d) => d.isActive !== false).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <div className="lv-grid">
            {shownDoctors.map((d) => (
              <button type="button" key={d.id} className={`lv-card pick ${doctorId === d.id ? 'sel' : ''}`} onClick={() => { setDoctorId(d.id); setDate(''); setTime(''); }}>
                <strong>{d.title} {d.name}</strong>
                <span>{d.specialization}</span>
                <small>{d.departmentName} · {pkr(d.consultationFee)}</small>
              </button>
            ))}
          </div>
          {!shownDoctors.length && <p>No doctors in this department.</p>}
        </section>
      )}

      {step === 2 && doctor && (
        <section>
          <h2 className="lv-h">{doctor.title} {doctor.name}</h2>
          <p className="lv-muted">Choose a date (Pakistan time). Greyed dates are not bookable.</p>
          <div className="lv-days">
            {days.map((d) => {
              const reason = dayBlockedReason(doctor, d, windowDays) || (slotsFor(doctor, d).length ? null : 'No slots left');
              return (
                <button type="button" key={d} disabled={!!reason} title={reason || ''} className={date === d ? 'sel' : ''} onClick={() => { setDate(d); setTime(''); }}>
                  <small>{weekday(d).slice(0, 3)}</small><b>{d.slice(8)}/{d.slice(5, 7)}</b>
                </button>
              );
            })}
          </div>
          {date && (
            <>
              <h3 className="lv-h">{prettyDate(date)}</h3>
              {!ready ? <p className="lv-muted">Checking live availability…</p> : (
                <div className="lv-times">
                  {times.map((t) => (
                    <button type="button" key={t} disabled={booked.has(t)} className={time === t ? 'sel' : ''} onClick={() => setTime(t)}>
                      {to12h(t)}{booked.has(t) ? ' · booked' : ''}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="lv-form">
          <label className="lv-label">Patient full name *<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" /></label>
          <label className="lv-label">Mobile number *<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03xx xxxxxxx" autoComplete="tel" /></label>
          <label className="lv-label">Email (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <div className="lv-row">
            <label className="lv-label">Age<input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={3} /></label>
            <label className="lv-label">Gender
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Prefer not to say</option><option>Male</option><option>Female</option><option>Other</option>
              </select>
            </label>
          </div>
          <label className="lv-label">Reason / notes (optional)<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></label>
        </section>
      )}

      {step === 4 && doctor && (
        <section>
          <div className="lv-card">
            <strong>{doctor.title} {doctor.name}</strong>
            <span>{doctor.specialization}{doctor.roomNumber ? ` · ${doctor.roomNumber}` : ''}</span>
            <span>{prettyDate(date)} at {to12h(time)}</span>
            <span>Patient: {name} · {phone}</span>
            <b>Consultation fee: {pkr(fee)}</b>
          </div>
          <h3 className="lv-h">How will you pay?</h3>
          <label className="lv-radio"><input type="radio" checked={payMode === 'onsite'} onChange={() => setPayMode('onsite')} /> Pay at the hospital (stays “Unpaid” until reception records it)</label>
          <label className="lv-radio"><input type="radio" checked={payMode === 'bank'} onChange={() => { setPayMode('bank'); setAmount(String(fee)); }} /> Bank transfer (hospital verifies it before marking paid)</label>
          {payMode === 'bank' && (
            <div className="lv-form">
              {bd ? <div className="lv-card"><b>Transfer to</b><span>{bd.bankName} — {bd.accountTitle}</span><span>Account: {bd.accountNumber}</span><span>IBAN: {bd.iban}</span><small>{bd.instructions}</small></div> : <p className="lv-error">Bank details have not been published yet. Please choose “Pay at the hospital”.</p>}
              <label className="lv-label">Your bank name<input value={bankName} onChange={(e) => setBankName(e.target.value)} /></label>
              <label className="lv-label">Transaction / reference number *<input value={txnRef} onChange={(e) => setTxnRef(e.target.value)} /></label>
              <label className="lv-label">Amount transferred (PKR) *<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></label>
              <label className="lv-label">Receipt screenshot (image, max 5 MB)<input type="file" accept="image/*" onChange={(e) => setReceipt(e.target.files?.[0] || null)} /></label>
              <p className="lv-muted">Uploading a receipt does not mean your payment is confirmed. It is marked paid only after the hospital verifies it.</p>
            </div>
          )}
          <label className="lv-radio"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to the <Link to="/terms" target="_blank">terms</Link> and <Link to="/privacy" target="_blank">privacy policy</Link>. I understand my appointment is a request until the hospital confirms it.</label>
        </section>
      )}

      <div className="lv-nav">
        {step > 1 && <button type="button" className="button outline lv-dark" onClick={() => { setError(''); setStep(step - 1); }} disabled={submitting}>Back</button>}
        {step < 4 && <button type="button" className="button" onClick={next}>Continue</button>}
        {step === 4 && <button type="button" className="button" onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit booking'}</button>}
      </div>
    </div>
  );
}