import { Link } from 'react-router';
import { Info, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { BookingPage } from '@/components/live/booking';
import { ConfirmationPage } from '@/components/live/confirmation';
import { DepartmentsPage, DoctorsPage, DoctorProfilePage, TeamSection } from '@/components/live/directory';
import { ContactPage, FaqPage, PaymentPage, ReviewsPage } from '@/components/live/questions';
function StaticInfo({slug}:{slug:string}){const titles:Record<string,string>={about:'Care built around people.',departments:'Find the right care.',doctors:'Meet your care team.',services:'Care for your everyday and beyond.',facilities:'A place designed for your care.',contact:'We’re here to help.',privacy:'Your privacy matters.',terms:'Terms & conditions.', 'payment-instructions':'Payment, explained.', 'book-appointment':'Your next step to better health.', 'patient-information':'A little guidance for your visit.', 'appointment-confirmation':'Appointment status.'};return <main className="info-page"><p className="eyebrow">CITY HOSPITAL · {slug.replaceAll('-',' ').toUpperCase()}</p><h1>{titles[slug]||'Doctor profile'}</h1>{slug==='patient-information'?<div className="faq">{[['What should I bring?','Bring identification, your previous medical reports, a current medication list and any relevant referral.'],['Can I book without an account?','Patients will not need an account. Booking opens after verified doctors, fees and schedules are configured.'],['Is this suitable for emergencies?','No. Do not use online booking for a medical emergency. Seek immediate local emergency assistance.'],['When is payment confirmed?','Payment is only marked paid after receipt or authorized verification. A receipt upload is not proof of payment.']].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>:<div className="setup"><Info/><h2>{slug==='book-appointment'?'Appointments are not open yet':slug==='doctors'?'Verified doctor profiles coming soon':'Hospital information is being prepared'}</h2><p>{slug==='book-appointment'?'The hospital must publish verified doctor profiles, consultation fees, clinic locations and schedules before appointments can be offered. No appointment has been reserved and no payment has been taken.':slug==='payment-instructions'?'Payment collection requires a plan upgrade. Bank instructions and a verified payment workflow have not been configured. Do not send payment until the hospital provides official instructions.':slug==='privacy'?'This preview does not collect patient information. A hospital-approved privacy notice, retention policy and contact for privacy enquiries must be published before booking opens.':slug==='terms'?'Appointments, cancellations, fees and payment terms must be approved and published by City Hospital before booking opens. This website is not a substitute for professional medical advice.':'Only approved hospital information will be published. Verified details have not yet been supplied; no qualifications, availability, facilities or contact details are assumed.'}</p><Link className="text-link" to="/patient-information">Read the patient guide <ArrowUpRight size={18}/></Link></div>}</main>}

function Shell({eyebrow,title,children}:{eyebrow:string;title:string;children:ReactNode}){return <main className="info-page"><p className="eyebrow">CITY HOSPITAL · {eyebrow}</p><h1>{title}</h1>{children}</main>}

export function InfoPage({slug,handle}:{slug:string;handle?:string}){
  switch(slug){
    case 'book-appointment': return <Shell eyebrow="BOOK AN APPOINTMENT" title="Book your visit"><BookingPage/></Shell>;
    case 'appointment-confirmation': return <Shell eyebrow="APPOINTMENT" title="Your appointment"><ConfirmationPage/></Shell>;
    case 'doctors': return handle
      ? <Shell eyebrow="DOCTOR PROFILE" title="Meet your doctor"><DoctorProfilePage handle={handle}/></Shell>
      : <Shell eyebrow="OUR DOCTORS" title="Meet your care team."><DoctorsPage/></Shell>;
    case 'departments': return <Shell eyebrow="DEPARTMENTS" title="Find the right care."><DepartmentsPage/></Shell>;
    case 'contact': return <Shell eyebrow="CONTACT" title="We’re here to help."><ContactPage/></Shell>;
    case 'patient-information': return <Shell eyebrow="PATIENT INFORMATION" title="Questions & answers"><FaqPage/></Shell>;
    case 'reviews': return <Shell eyebrow="PATIENT REVIEWS" title="What our patients say"><ReviewsPage/></Shell>;
    case 'payment-instructions': return <Shell eyebrow="PAYMENT" title="Payment, explained."><PaymentPage/></Shell>;
    case 'about': return <><StaticInfo slug={slug}/><TeamSection/></>;
    default: return <StaticInfo slug={slug}/>;
  }
}