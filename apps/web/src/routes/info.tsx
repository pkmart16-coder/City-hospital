import type { Route } from './+types/info';
import { seo } from '@/lib/seo';
import { InfoPage } from '@/components/info-page';
export function meta({matches,location}:Route.MetaArgs){return seo({matches,location},{title:`${location.pathname.slice(1).replaceAll('-',' ')} | City Hospital`,description:'City Hospital patient information, care directory and appointment guidance.'});}
export default function Page({params}:Route.ComponentProps){return <InfoPage slug={params.page||'about'}/>;}
