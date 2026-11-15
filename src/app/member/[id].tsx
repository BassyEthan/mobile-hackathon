import { useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/profile-view';
import type { Id } from '../../../convex/_generated/dataModel';

export default function MemberProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProfileView targetId={id as Id<'members'>} />;
}
