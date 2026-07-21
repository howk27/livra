/**
 * app/settings/account.tsx — the Sign-in screen.
 *
 * Pins the behaviours that cannot be read off the pure module: that changing a
 * password REAUTHENTICATES first (updateUser alone never checks the old one),
 * that Apple-only accounts never see a password form, and that the email result
 * message is derived from what Supabase actually returned rather than assumed.
 */
jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = () => React.createElement(View, null);
  return new Proxy({}, { get: (_: any, name: string) => (name === '__esModule' ? true : stub) });
});

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

jest.mock('../../components/ui/LivraHeader', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LivraHeader: () => React.createElement(View, null) };
});

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
  }),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AccountScreen from '../../app/settings/account';
import { APPLE_PRIVATE_RELAY_DOMAIN } from '../../lib/auth/accountCredentials';

const emailUser = {
  email: 'sam@example.com',
  identities: [{ provider: 'email' }],
  app_metadata: { provider: 'email', providers: ['email'] },
};

const appleUser = {
  email: `abc123@${APPLE_PRIVATE_RELAY_DOMAIN}`,
  identities: [{ provider: 'apple' }],
  app_metadata: { provider: 'apple', providers: ['apple'] },
};

beforeEach(() => {
  mockCalls.length = 0;
  mockSignInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  mockUpdateUser.mockReset().mockResolvedValue({ data: { user: emailUser }, error: null });
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockAuthState.user = emailUser;
  mockAuthState.initialized = true;
  mockAuthState.loading = false;
});

function changePassword(api: ReturnType<typeof render>, current: string, next: string, confirm: string) {
  fireEvent.changeText(api.getByPlaceholderText('Your current password'), current);
  fireEvent.changeText(api.getByPlaceholderText('At least 8 characters'), next);
  fireEvent.changeText(api.getByPlaceholderText('Repeat it once more'), confirm);
  fireEvent.press(api.getByText('Change password'));
}

describe('loading and signed-out states', () => {
  it('shows a quiet line while auth is still settling', () => {
    mockAuthState.initialized = false;
    const { getByText } = render(<AccountScreen />);
    expect(getByText(/Reading your account/i)).toBeTruthy();
  });

  it('explains the empty state when there is no user', () => {
    mockAuthState.user = null;
    const { getByText } = render(<AccountScreen />);
    expect(getByText(/You are signed out/i)).toBeTruthy();
  });
});

describe('password change', () => {
  it('reauthenticates with the current password before updating', async () => {
    const api = render(<AccountScreen />);
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
    mockSignInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
    const api = render(<AccountScreen />);
    changePassword(api, 'wrongpassword', 'newpassword', 'newpassword');

    await waitFor(() => expect(api.getByText(/current password is not right/i)).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('never touches the network when the fields do not validate', async () => {
    const api = render(<AccountScreen />);
    changePassword(api, 'oldpassword', 'newpassword', 'different');

    await waitFor(() => expect(api.getByText(/do not match/i)).toBeTruthy());
    expect(mockCalls).toEqual([]);
  });

  it('surfaces a failed update after a good reauthentication', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    const api = render(<AccountScreen />);
    changePassword(api, 'oldpassword', 'newpassword', 'newpassword');

    await waitFor(() => expect(api.getByText(/connection/i)).toBeTruthy());
  });
});

describe('Apple accounts', () => {
  beforeEach(() => {
    mockAuthState.user = appleUser;
  });

  it('offers no password form and explains why', () => {
    const { queryByPlaceholderText, getByText } = render(<AccountScreen />);
    expect(queryByPlaceholderText('Your current password')).toBeNull();
    expect(getByText(/no password on this account/i)).toBeTruthy();
  });

  it('prompts a private-relay user to set a real email', () => {
    const { getByText } = render(<AccountScreen />);
    expect(getByText(/Apple keeps your real address hidden/i)).toBeTruthy();
  });
});

describe('email change', () => {
  it('says the change is pending when Supabase returns a new_email', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: { email: 'sam@example.com', new_email: 'new@example.com' } },
      error: null,
    });
    const api = render(<AccountScreen />);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'new@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(api.getByText(/Confirm the link we sent to new@example.com/i)).toBeTruthy());
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });

  it('does not claim a mail was sent when confirmation is off', async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: { email: 'new@example.com' } }, error: null });
    const api = render(<AccountScreen />);
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
    const api = render(<AccountScreen />);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'taken@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(api.getByText(/Another account already uses that email/i)).toBeTruthy());
  });

  it('rejects the address already on the account without calling Supabase', async () => {
    const api = render(<AccountScreen />);
    fireEvent.changeText(api.getByPlaceholderText('you@example.com'), 'sam@example.com');
    fireEvent.press(api.getByText('Update email'));

    await waitFor(() => expect(api.getByText(/already your email/i)).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('shows the waiting banner while a confirmation is outstanding', () => {
    mockAuthState.user = { ...emailUser, new_email: 'new@example.com' };
    const { getByText } = render(<AccountScreen />);
    expect(getByText(/Waiting on new@example.com/i)).toBeTruthy();
  });
});
