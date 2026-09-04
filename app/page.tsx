import { HomeHero } from '@/components/HomeHero';
import { getUser } from '@/lib/supabase/server';

export default async function Home() {
  const user = await getUser();
  return <HomeHero authenticated={Boolean(user)} />;
}
