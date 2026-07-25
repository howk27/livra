/**
 * app/settings/profile.tsx — Edit Profile, the single identity screen.
 *
 * Moved here from accountScreen.test.tsx when the separate Sign-in screen was
 * retired (2026-07-22). Pins the behaviours that cannot be read off the pure
 * module: that CHANGING a password REAUTHENTICATES first (updateUser alone
 * never checks the old one), that ADDING a password to an Apple-only account
 * asks for no current password, that an Apple account gets an editable email
 * field rather than an explanation, and that the email result message is
 * derived from what Supabase actually returned rather than assumed.
 */
jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = () => React.createElement(View, null);
  return new Proxy({}, { get: (_: any, name: string) => (name === '__esModule' ? true : stub) });
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Animated = {
    View: (props: any) => React.createElement(View, props),
    Text: (props: any) => React.createElement(Text, props),
    createAnimatedComponent: (C: any) => C,
  };
  const entering = { duration: () => entering, delay: () => entering };
  return { __esModule: true, default: Animated, ...Animated, FadeIn: entering };
});

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

jest.mock('../../components/ui/LivraHeader', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LivraHeader: () => React.createElement(View, null) };
});

const mockAppleSignIn = jest.fn();
const mockAppleAvailable = jest.fn();
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: (...args: any[]) => mockAppleAvailable(...args),
  signInAsync: (...args: any[]) => mockAppleSignIn(...args),
  AppleAuthenticationScope: { EMAIL: 'EMAIL', FULL_NAME: 'FULL_NAME' },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('../../lib/storage/avatarStorage', () => ({
  getAvatarUrl: jest.fn().mockResolvedValue(null),
  uploadAvatar: jest.fn().mockResolvedValue(undefined),
}));

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
jest.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));

const mockAuthState: { user: any; initialized: boolean; loading: boolean } = {
  user: null,
  initialized: true,
  loading: false,
};
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => mockAuthState }));

const mockSignInWithPassword = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockCalls: string[] = [];
const mockMaybeSingle = jest.fn();
jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: (...args: any[]) => {
        mockCalls.push('signInWithPassword');
        return mockSignInWithPassword(...args);
      },
      updateUser: (...args: any[]) => {
        mockCalls.push('updateUser');
        return mockUpdateUser(...args);
      },
      signInWithIdToken: (...args: any[]) => {
        mockCalls.push('signInWithIdToken');
        return mockSignInWithIdToken(...args);
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../../app/settings/profile';
import { APPLE_PRIVATE_RELAY_DOMAIN } from '../../lib/auth/accountCredentials';

const emailUser = {
  id: 'user-1',
  email: 'sam@example.com',
  identities: [{ provider: 'email' }],
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
};

const appleUser = {
  id: 'user-2',
  email: `abc123@${APPLE_PRIVATE_RELAY_DOMAIN}`,
  identities: [{ provider: 'apple' }],
  app_metadata: { provider: 'apple', providers: ['apple'] },
  user_metadata: {},
};

beforeEach(() => {
  mockCalls.length = 0;
  mockSignInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  mockSignInWithIdToken.mockReset().mockResolvedValue({ data: { user: appleUser }, error: null });
  mockAppleAvailable.mockReset().mockResolvedValue(true);
  mockAppleSignIn.mockReset().mockResolvedValue({ identityToken: 'apple-jwt' });
  mockUpdateUser.mockReset().mockResolvedValue({ data: { user: emailUser }, error: null });
  mockMaybeSingle.mockReset().mockResolvedValue({ data: { display_name: 'Sam' }, error: null });
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockAuthState.user = emailUser;
  mockAuthState.initialized = true;
  mockAuthState.loading = false;
});

// Placeholders after the 2026-07-23 flatten: the change/add copy differs, and
// the email rests as a greyed on-file value that taps to edit.
//
// 2026-07-24: the password block folds behind a disclosure row (founder: three
// standing password fields made the screen read as "set a password to save
// anything"), so every password helper opens it first.
function openPasswordEditor(api: ReturnType<typeof render>) {
  fireEvent.press(api.getByLabelText(/^(Change password|Set a password)$/));
}

function changePassword(
  api: ReturnType<typeof render>,
  current: string,
  next: string,
  confirm: string,
) {
  openPasswordEditor(api);
  fireEvent.changeText(api.getByPlaceholderText('Current password'), current);
  fireEvent.changeText(api.getByPlaceholderText('New password'), next);
  fireEvent.changeText(api.getByPlaceholderText('Repeat new password'), confirm);
  fireEvent.press(api.getByText('Change password'));
}

function setPassword(api: ReturnType<typeof render>, next: string, confirm: string) {
  openPasswordEditor(api);
  fireEvent.changeText(api.getByPlaceholderText('Password (at least 8 characters)'), next);
  fireEvent.changeText(api.getByPlaceholderText('Repeat password'), confirm);
  fireEvent.press(api.getByText('Set password'));
}

/** Reveal the email TextInput — it rests as a greyed on-file value until tapped. */
function openEmailEditor(api: ReturnType<typeof render>) {
  fireEvent.press(api.getByLabelText(/Tap to edit/i));
}

/**
 * Founder decision 2026-07-24: email is the recovery channel, so an account
 * that HAS a password proves ownership before changing it. Apple-only accounts
 * have none and are not asked.
 */
function confirmEmailPassword(api: ReturnType<typeof render>, password: string) {
  fireEvent.changeText(api.getByPlaceholderText('Your password'), password);
}

describe('loading and signed-out states', () => {
  it('shows a quiet line while auth is still settling', () => {
    mockAuthState.initialized = false;
    const { getByText } = render(<ProfileScreen />);
    expect(getByText(/Reading your account/i)).toBeTruthy();
  });

  it('explains the empty state when there is no user', () => {
    mockAuthState.user = null;
    const { getByText } = render(<ProfileScreen />);
    expect(getByText(/You are signed out/i)).toBeTruthy();
  });
});

describe('password change (an account that already has one)', () => {
  it('reauthenticates with the current password before updating', async () => {
    const api = render(<ProfileScreen />);
    changePassword(api, 'oldpassword', 'newpassword', 'newpassword');

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(mockCalls).toEqual(['signInWithPassword', 'updateUser']);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'oldpassword',
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword' });
    expect(mockShowSuccess).toHaveBeenCalledWith('Your password is updated.');
  });

  it('stops at reauthentication when the current password is wrong', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    const api = render(<ProfileScreen />);
    changePassword(api, 'wrongpassword', 'newpassword', 'newpassword');

    await waitFor(() => expect(api.getByText(/current password is not right/i)).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('never touches the network when the fields do not validate', async () => {
    const api = render(<ProfileScreen />);
    changePassword(api, 'oldpassword', 'newpassword', 'different');

    await waitFor(() => expect(api.getByText(/do not match/i)).toBeTruthy());
    expect(mockCalls).toEqual([]);
  });

  it('surfaces a failed update after a good reauthentication', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    const api = render(<ProfileScreen />);
    changePassword(api, 'oldpassword', 'newpassword', 'newpassword');

    await waitFor(() => expect(api.getByText(/connection/i)).toBeTruthy());
  });
});

describe('adding a password (Apple-only account)', () => {
  beforeEach(() => {
    mockAuthState.user = appleUser;
  });

  it('asks for no current password and writes without reauthenticating', async () => {
    const api = render(<ProfileScreen />);
    expect(api.queryByPlaceholderText('Current password')).toBeNull();

    setPassword(api, 'newpassword', 'newpassword');

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(mockCalls).toEqual(['updateUser']);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword' });
    expect(mockShowSuccess).toHaveBeenCalledWith('Your password is set.');
  });

  it('still enforces length and confirmation without any network call', async () => {
    const api = render(<ProfileScreen />);
    setPassword(api, 'short', 'short');

    await waitFor(() => expect(api.getByText(/8 characters/i)).toBeTruthy());
    expect(mockCalls).toEqual([]);
  });

  it('asks for the current password once a password exists on the account', async () => {
    const api = render(<ProfileScreen />);
    setPassword(api, 'newpassword', 'newpassword');

    // The block folds itself away on success; re-opening it must now present
    // the CHANGE form, because the account has a password from this point on.
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Your password is set.'));
    expect(api.queryByPlaceholderText('Password (at least 8 characters)')).toBeNull();
    openPasswordEditor(api);
    expect(api.getByPlaceholderText('Current password')).toBeTruthy();
    expect(api.getByText('Change password')).toBeTruthy();
  });

  it('offers an editable email field instead of an explanation', () => {
    const api = render(<ProfileScreen />);
    // The Apple relay address is shown as the on-file value, editable on tap —
    // not a dead-end explanation.
    expect(api.getByText(appleUser.email)).toBeTruthy();
    openEmailEditor(api);
    const field = api.getByPlaceholderText('you@example.com');
    expect(field.props.value).toBe(appleUser.email);
    expect(field.props.editable).not.toBe(false);
    expect(api.queryByText(/nothing to change here/i)).toBeNull();
    expect(api.queryByText(/Apple keeps your real address hidden/i)).toBeNull();
  });

  it('swaps the Apple relay address for a real one', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: { email: appleUser.email, new_email: 'real@example.com' } },
      error: null,
    });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'real@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'real@example.com' }));
  });
});

describe('email change', () => {
  it('pre-fills the field with the address on file', () => {
    const api = render(<ProfileScreen />);
    // Shown as the on-file value before tapping; the editor pre-fills it too.
    expect(api.getByText('sam@example.com')).toBeTruthy();
    openEmailEditor(api);
    expect(api.getByPlaceholderText('you@example.com').props.value).toBe('sam@example.com');
  });

  it('says the change is pending when Supabase returns a new_email', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: { email: 'sam@example.com', new_email: 'new@example.com' } },
      error: null,
    });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'new@example.com');
    confirmEmailPassword(api, 'oldpassword');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() =>
      expect(api.getByText(/Confirm the link we sent to new@example.com/i)).toBeTruthy(),
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });

  it('does not claim a mail was sent when confirmation is off', async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: { email: 'new@example.com' } }, error: null });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'new@example.com');
    confirmEmailPassword(api, 'oldpassword');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(api.getByText(/Your email is now new@example.com/i)).toBeTruthy());
    expect(api.queryByText(/Confirm the link/i)).toBeNull();
  });

  it('reports the already-in-use path', async () => {
    mockUpdateUser.mockResolvedValue({
      data: null,
      error: { message: 'A user with this email address has already been registered' },
    });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'taken@example.com');
    confirmEmailPassword(api, 'oldpassword');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() =>
      expect(api.getByText(/Another account already uses that email/i)).toBeTruthy(),
    );
  });

  it('never calls Supabase while the field still holds the address on file', async () => {
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'sam@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(mockUpdateUser).not.toHaveBeenCalled());
  });

  it('shows the waiting banner while a confirmation is outstanding', () => {
    mockAuthState.user = { ...emailUser, new_email: 'new@example.com' };
    const { getByText } = render(<ProfileScreen />);
    expect(getByText(/Waiting on new@example.com/i)).toBeTruthy();
  });
});

/**
 * Founder decision 2026-07-24. Email is the account recovery channel: control
 * it and you can reset the password and take the account. updateUser({email})
 * checks no password of its own, so the screen must.
 */
describe('email change reauthenticates (password accounts)', () => {
  it('proves the current password BEFORE writing the new email', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: { email: 'sam@example.com', new_email: 'new@example.com' } },
      error: null,
    });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'new@example.com');
    confirmEmailPassword(api, 'oldpassword');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    // Order is the whole point: a write that beats the check protects nothing.
    expect(mockCalls).toEqual(['signInWithPassword', 'updateUser']);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'oldpassword',
    });
  });

  it('never writes the email when the password is wrong', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'new@example.com');
    confirmEmailPassword(api, 'wrongpassword');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(api.getByText(/current password is not right/i)).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('touches no network at all until a password is entered', async () => {
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    const field = api.getByPlaceholderText('you@example.com');
    fireEvent.changeText(field, 'new@example.com');

    // The button is inert without a password, the same way it is inert while
    // the address is unchanged.
    fireEvent.press(api.getByText('Update email'));
    expect(mockCalls).toEqual([]);

    // The keyboard "done" path bypasses the button entirely, so the validator
    // has to hold the line there too, and say why.
    fireEvent(field, 'submitEditing');
    await waitFor(() => expect(api.getByText(/Enter your current password/i)).toBeTruthy());
    expect(mockCalls).toEqual([]);
  });

  // REWRITTEN 2026-07-25. This test used to assert that an Apple-only account
  // changed its email with NO proof of ownership at all, on the assumption that
  // Supabase's confirmation link was the gate. Checked against the live project:
  // "Confirm email" is OFF, every signup is auto-confirmed within ~50ms and no
  // mail is ever sent, so there was no gate -- an unlocked phone could move the
  // recovery channel. A fresh Sign in with Apple is now that proof.
  it('asks an Apple-only account for Apple, not for a password', async () => {
    mockAuthState.user = appleUser;
    mockUpdateUser.mockResolvedValue({
      data: { user: { email: 'real@example.com' } },
      error: null,
    });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    // Still no password field: there is no password to prove.
    expect(api.queryByPlaceholderText('Your password')).toBeNull();
    expect(api.getByText(/Apple will confirm it is you/i)).toBeTruthy();
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'real@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'real@example.com' }));
    expect(mockAppleSignIn).toHaveBeenCalled();
    expect(mockCalls).toEqual(['signInWithIdToken', 'updateUser']);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('does not change the email when Apple sign-in is cancelled', async () => {
    mockAuthState.user = appleUser;
    mockAppleSignIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'real@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(mockAppleSignIn).toHaveBeenCalled());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('refuses when a DIFFERENT Apple ID answers -- that proves nothing about this account', async () => {
    mockAuthState.user = appleUser;
    mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'someone-else' } }, error: null });
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'real@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(api.getByText(/different Apple ID/i)).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('keeps the two password fields distinguishable when both blocks are open', () => {
    const api = render(<ProfileScreen />);
    openEmailEditor(api);
    openPasswordEditor(api);
    // Identical placeholders here would make the user guess which is which.
    expect(api.getByPlaceholderText('Your password')).toBeTruthy();
    expect(api.getByPlaceholderText('Current password')).toBeTruthy();
  });
});

/**
 * Founder 2026-07-24: "It's not changing the password every time they want to
 * update info." Three standing password fields made the whole screen read as a
 * password form. Name and avatar are never gated.
 */
describe('the password block rests folded', () => {
  it('shows no password fields until the disclosure is opened', () => {
    const api = render(<ProfileScreen />);
    expect(api.queryByPlaceholderText('Current password')).toBeNull();
    expect(api.queryByPlaceholderText('New password')).toBeNull();
    expect(api.queryByPlaceholderText('Repeat new password')).toBeNull();
    expect(api.getByLabelText('Change password')).toBeTruthy();
  });

  it('offers an Apple-only account "Set a password" instead', () => {
    mockAuthState.user = appleUser;
    const api = render(<ProfileScreen />);
    expect(api.getByLabelText('Set a password')).toBeTruthy();
  });

  it('lets the name be saved without any password anywhere on screen', async () => {
    const api = render(<ProfileScreen />);
    await waitFor(() => expect(api.getByDisplayValue('Sam')).toBeTruthy());
    fireEvent.changeText(api.getByDisplayValue('Sam'), 'Samantha');
    fireEvent.press(api.getByText('Save changes'));

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Profile updated.'));
    // A name is a display preference, not an access path: no reauth, and an
    // Apple account has no password to demand in the first place.
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('discards a half-typed password when the block is closed again', () => {
    const api = render(<ProfileScreen />);
    openPasswordEditor(api);
    fireEvent.changeText(api.getByPlaceholderText('New password'), 'halftyped');
    fireEvent.press(api.getByText('Cancel'));

    expect(api.queryByPlaceholderText('New password')).toBeNull();
    openPasswordEditor(api);
    expect(api.getByPlaceholderText('New password').props.value).toBe('');
  });
});

/**
 * Founder 2026-07-24: "Unable to update my name (account created through Apple
 * Auth)". The name DID save to profiles.display_name, but the Focus greeting
 * reads the AUTH metadata, which this screen never wrote. Both are written now.
 */
describe('saving the name reaches the greeting', () => {
  it('mirrors the name into the auth metadata the greeting reads', async () => {
    const api = render(<ProfileScreen />);
    await waitFor(() => expect(api.getByDisplayValue('Sam')).toBeTruthy());
    fireEvent.changeText(api.getByDisplayValue('Sam'), 'Samantha');
    fireEvent.press(api.getByText('Save changes'));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { display_name: 'Samantha' } }),
    );
    expect(mockShowSuccess).toHaveBeenCalledWith('Profile updated.');
  });

  it('trims the name before it reaches either store', async () => {
    const api = render(<ProfileScreen />);
    await waitFor(() => expect(api.getByDisplayValue('Sam')).toBeTruthy());
    fireEvent.changeText(api.getByDisplayValue('Sam'), '  Samantha  ');
    fireEvent.press(api.getByText('Save changes'));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { display_name: 'Samantha' } }),
    );
  });

  it('says the name saved but the greeting lagged when only the mirror fails', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    const api = render(<ProfileScreen />);
    await waitFor(() => expect(api.getByDisplayValue('Sam')).toBeTruthy());
    fireEvent.changeText(api.getByDisplayValue('Sam'), 'Samantha');
    fireEvent.press(api.getByText('Save changes'));

    // The stored name IS saved; claiming the whole save failed would be a lie.
    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith(
        'Your name is saved, but the greeting may still show the old one.',
      ),
    );
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });
});
