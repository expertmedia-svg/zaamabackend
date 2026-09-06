import { memberLabel } from './member-label';

describe('member labels', () => {
  it.each(['Nouveau membre', ' nouveau membre ', ''])('replaces placeholder %s with the phone', (displayName) => {
    const user = { id: 'member', phone: '+22670123456', profile: { displayName, username: 'user-1' } };
    const result = memberLabel(user);
    expect(result.profile.displayName).toBe(user.phone);
    expect(result.profile.username).toBe('user-1');
    expect(result).not.toHaveProperty('phone');
    expect(user.profile.displayName).toBe(displayName);
  });
  it('preserves a chosen name without adding a phone field', () => {
    const result = memberLabel({ phone: '+22670123456', profile: { displayName: 'Awa' } });
    expect(result.profile.displayName).toBe('Awa');
    expect(result).not.toHaveProperty('phone');
  });
  it('handles members without a profile', () => {
    expect(memberLabel({ phone: '+22670123456', profile: null }).profile.displayName).toBe('+22670123456');
  });
});
