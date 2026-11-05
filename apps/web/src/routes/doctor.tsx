import type { Route } from './+types/doctor';
import { seo } from '@/lib/seo';
import { InfoPage } from '@/components/info-page';
export function meta({matches,location}:Route.MetaArgs){return seo({matches,location},{title:'Doctor profile | City Hospital',description:'Verified City Hospital doctor information.',noindex:true});}
export default function Doctor({params}:Route.ComponentProps){return <InfoPage slug="doctors" handle={params.handle}/>;}
