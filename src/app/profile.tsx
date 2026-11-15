import { Loading, Screen } from '@/components/ui';
import { ProfileView } from '@/components/profile-view';
import { useMe } from '@/lib/session';

export default function MyProfile() {
  const me = useMe();
  if (!me) return <Screen scroll={false}><Loading /></Screen>;
  return <ProfileView targetId={me.memberId} />;
}
