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
  mockUpdateUser.mockReset().mockResolvedValue({ data: { user: emailUser }, error: null });
  mockMaybeSingle.mockReset().mockResolvedValue({ data: { display_name: 'Sam' }, error: null });
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockAuthState.user = emailUser;
  mockAuthState.initialized = true;
  mockAuthState.loading = false;
});

function changePassword(
  api: ReturnType<typeof render>,
  current: string,
  next: string,
  confirm: string,
) {
  fireEvent.changeText(api.getByPlaceholderText('Your current password'), current);
  fireEvent.changeText(api.getByPlaceholderText('At least 8 characters'), next);
  fireEvent.changeText(api.getByPlaceholderText('Repeat it once more'), confirm);
  fireEvent.press(api.getByText('Change password'));
}

function setPassword(api: ReturnType<typeof render>, next: string, confirm: string) {
  fireEvent.changeText(api.getByPlaceholderText('At least 8 characters'), next);
  fireEvent.changeText(api.getByPlaceholderText('Repeat it once more'), confirm);
  fireEvent.press(api.getByText('Set password'));
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
    expect(api.queryByPlaceholderText('Your current password')).toBeNull();

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

    await waitFor(() => expect(api.getByPlaceholderText('Your current password')).toBeTruthy());
    expect(api.getByText('Change password')).toBeTruthy();
  });

  it('offers an editable email field instead of an explanation', () => {
    const api = render(<ProfileScreen />);
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
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'real@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'real@example.com' }));
  });
});

describe('email change', () => {
  it('pre-fills the field with the address on file', () => {
    const api = render(<ProfileScreen />);
    expect(api.getByPlaceholderText('you@example.com').props.value).toBe('sam@example.com');
  });

  it('says the change is pending when Supabase returns a new_email', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: { email: 'sam@example.com', new_email: 'new@example.com' } },
      error: null,
    });
    const api = render(<ProfileScreen />);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'new@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() =>
      expect(api.getByText(/Confirm the link we sent to new@example.com/i)).toBeTruthy(),
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });

  it('does not claim a mail was sent when confirmation is off', async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: { email: 'new@example.com' } }, error: null });
    const api = render(<ProfileScreen />);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'new@example.com');
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
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'taken@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() =>
      expect(api.getByText(/Another account already uses that email/i)).toBeTruthy(),
    );
  });

  it('never calls Supabase while the field still holds the address on file', async () => {
    const api = render(<ProfileScreen />);
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
