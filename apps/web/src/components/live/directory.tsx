import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  dayBlockedReason, nextAvailableDate, pkr, prettyDate, useCollection, useSettings, weekday,
  type Department, type Doctor, type StaffPublic,
} from '@/lib/hospital';

function useDoctors() {
  const { items, loading, error } = useCollection<Doctor>('doctors');
  return { doctors: useMemo(() => items.filter((d) => d.isActive && d.isPublicVisible), [items]), loading, error };
}

export function DepartmentsPage() {
  const { items, loading, error } = useCollection<Department>('departments');
  const { doctors } = useDoctors();
  if (loading) return <p>Loading departments…</p>;
  if (error) return <div className="setup"><p>{error}</p></div>;
  const list = items.filter((d) => d.isActive !== false);
  if (!list.length) return <div className="setup"><h2>Departments will appear here</h2><p>The hospital has not published its departments yet.</p></div>;
  return (
    <div className="lv-grid">
      {list.map((d) => (
        <Link key={d.id} to={`/doctors?dept=${d.id}`} className="lv-card">
          <strong>{d.name}</strong>
          <span>{d.description}</span>
          <small>{d.location} · {doctors.filter((x) => x.departmentId === d.id).length} doctor(s)</small>
        </Link>
      ))}
    </div>
  );
}

export function DoctorsPage() {
  const [params] = useSearchParams();
  const { doctors, loading, error } = useDoctors();
  const { items: departments } = useCollection<Department>('departments');
  const settings = useSettings();
  const [dept, setDept] = useState(params.get('dept') || '');
  const [q, setQ] = useState('');
  const win = settings?.policies?.appointmentBookingWindowDays || 30;
  if (loading) return <p>Loading doctors…</p>;
  if (error) return <div className="setup"><p>{error}</p></div>;
  const list = doctors.filter((d) => (!dept || d.departmentId === dept) && `${d.name} ${d.specialization}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="lv-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search doctor or specialty" aria-label="Search doctors" />
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      {!list.length && <div className="setup"><p>No doctors match. Verified doctor profiles appear here once published by the hospital.</p></div>}
      <div className="lv-grid">
        {list.map((d) => {
          const next = nextAvailableDate(d, win);
          return (
            <article key={d.id} className="lv-card">
              {d.photoUrl && <img src={d.photoUrl} alt={`${d.title} ${d.name}`} loading="lazy" className="lv-photo" />}
              <strong>{d.title} {d.name}</strong>
              <span>{d.specialization}</span>
              <small>{d.qualifications}</small>
              <small>{next ? `Next available: ${prettyDate(next)}` : 'No bookable dates right now'} · Fee {pkr(d.consultationFee)}</small>
              <div className="lv-row">
                <Link className="text-link" to={`/doctors/${d.id}`}>View profile</Link>
                {next && <Link className="button header-cta" to={`/book-appointment?doctor=${d.id}`}>Book</Link>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function DoctorProfilePage({ handle }: { handle: string }) {
  const { doctors, loading } = useDoctors();
  const settings = useSettings();
  const win = settings?.policies?.appointmentBookingWindowDays || 30;
  if (loading) return <p>Loading…</p>;
  const d = doctors.find((x) => x.id === handle);
  if (!d) return <div className="setup"><h2>Doctor not found</h2><p>This profile is not available.</p><Link className="text-link" to="/doctors">All doctors</Link></div>;
  const next = nextAvailableDate(d, win);
  const todayBlocked = dayBlockedReason(d, new Date().toISOString().slice(0, 10), win);
  return (
    <article className="lv-profile">
      {d.photoUrl && <img src={d.photoUrl} alt={`${d.title} ${d.name}`} className="lv-photo big" />}
      <div>
        <h2 className="lv-h">{d.title} {d.name}</h2>
        <p>{d.specialization} · {d.departmentName}</p>
        <p className="lv-muted">{d.qualifications}</p>
        {d.biography && <p>{d.biography}</p>}
        <p>{d.experienceYears ? `${d.experienceYears} years of experience · ` : ''}Fee {pkr(d.consultationFee)}{d.roomNumber ? ` · ${d.roomNumber}` : ''}</p>
        <p><b>{next ? `Next available: ${prettyDate(next)}` : 'Not bookable right now'}</b>{todayBlocked === 'Unavailable today' ? ' (unavailable today)' : ''}</p>
        <h3 className="lv-h">Weekly schedule</h3>
        <ul className="lv-instr">
          {(d.weeklySchedule || []).map((w) => (
            <li key={w.day}>{w.day}: {w.enabled && w.slots?.length ? w.slots.map((s) => `${s.startTime}–${s.endTime}`).join(', ') : 'Not available'}</li>
          ))}
        </ul>
        {next && <Link className="button" to={`/book-appointment?doctor=${d.id}`}>Book an appointment</Link>}
      </div>
    </article>
  );
}

export function TeamSection() {
  const { items } = useCollection<StaffPublic>('staffPublicProfiles');
  if (!items.length) return null;
  return (
    <section className="section">
      <h2>Our team</h2>
      <div className="lv-grid">
        {items.map((s) => (
          <article key={s.id} className="lv-card">
            {s.photoUrl && <img src={s.photoUrl} alt={s.name} loading="lazy" className="lv-photo" />}
            <strong>{s.name}</strong>
            <span>{s.designation} · {s.department}</span>
            {s.biography && <small>{s.biography}</small>}
            <small>{s.workingDays?.length ? `${s.workingDays.map((x) => x.slice(0, 3)).join(', ')} · ` : ''}{s.shiftTiming}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
