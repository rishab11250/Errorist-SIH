import { HttpResponse, http } from 'msw';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/components/auth/LoginForm';
import { safeNextPath } from '@/lib/api-client';
import { server } from './server';

const INSPECTOR = {
  id: 7,
  username: 'inspector',
  display_name: 'Inspector One',
  role: 'inspector' as const,
};

async function enterCredentials() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Username'), 'inspector');
  await user.type(screen.getByLabelText('Password'), 'correct password');
  return user;
}

describe('login form', () => {
  it('submits credentials with cookies and returns the authenticated user', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let received: unknown;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ user: INSPECTOR });
      })
    );
    const onAuthenticated = vi.fn();
    render(<LoginForm onAuthenticated={onAuthenticated} />);
    const user = await enterCredentials();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(received).toEqual({ username: 'inspector', password: 'correct password' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ credentials: 'include' })
    );
    expect(onAuthenticated).toHaveBeenCalledWith(INSPECTOR);
    fetchSpy.mockRestore();
  });

  it('shows recovery guidance for an API error', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json(
          {
            error: 'invalid_credentials',
            detail: 'Username or password is incorrect.',
            request_id: 'r1',
          },
          { status: 401 }
        )
      )
    );
    render(<LoginForm onAuthenticated={() => undefined} />);
    const user = await enterCredentials();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Username or password is incorrect.'
    );
  });

  it('reveals and hides the password without losing its value', async () => {
    render(<LoginForm onAuthenticated={() => undefined} />);
    const user = userEvent.setup();
    const password = screen.getByLabelText('Password');
    await user.type(password, 'remember me');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('remember me');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('accepts local return paths and rejects open redirects', () => {
    expect(safeNextPath('/history?page=2')).toBe('/history?page=2');
    expect(safeNextPath('https://example.com/steal')).toBe('/');
    expect(safeNextPath('//example.com/steal')).toBe('/');
    expect(safeNextPath('/\\example.com/steal')).toBe('/');
  });
});
