import type { Route } from './+types/home';
import { seo } from '@/lib/seo';
import { Hero } from '@/components/home/hero';
import { Care } from '@/components/home/care';
import { HomeOffers } from '@/components/live/offers';
export function meta({ matches, location }: Route.MetaArgs) {return seo({matches,location},{title:'City Hospital | Care, with you at its heart',description:'Discover City Hospital, explore patient guidance and prepare for your next visit. Verified doctor profiles and appointments coming soon.'});}
export default function HomePage(){return <main><HomeOffers/><Hero/><Care/></main>;}
