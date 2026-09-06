// Only use in responses for existing conversation/group members or matched contacts.
export function memberLabel<T extends { phone: string; profile: { displayName: string } | null }>(user: T) {
  const { phone, ...rest } = user;
  const name = user.profile?.displayName?.trim();
  const placeholder = !name || name.toLowerCase() === 'nouveau membre';
  return {
    ...rest,
    profile: {
      ...user.profile,
      displayName: placeholder ? phone : user.profile!.displayName,
    },
  };
}
