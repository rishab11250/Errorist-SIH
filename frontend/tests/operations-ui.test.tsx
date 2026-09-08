import { HttpResponse, http } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserTable, type ManagedUser } from '@/components/auth/UserTable';
import { StatusChart } from '@/components/dashboard/StatusChart';
import { RepositoryPage } from '@/components/repository/RepositoryPage';
import { WorkspaceShell } from '@/components/WorkspaceShell';
import { server } from './server';

const mockRouter = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/history',
  useRouter: () => mockRouter,
}));

const INSPECTOR = {
  id: 7,
  username: 'inspector',
  display_name: 'Inspector One',
  role: 'inspector' as const,
};

const USERS: ManagedUser[] = [
  {
    id: 1,
    username: 'admin',
    display_name: 'Administrator',
    role: 'admin',
    is_active: true,
    created_at: '2026-09-01T09:00:00Z',
    updated_at: '2026-09-01T09:00:00Z',
    last_login_at: null,
  },
];

describe('operations workspace', () => {
  beforeEach(() => {
    mockRouter.replace.mockReset();
    server.use(
      http.get('/api/history', () =>
        HttpResponse.json({ items: [], page: 1, page_size: 20, total: 0 })
      )
    );
  });

  it('serializes filters into the URL and API request', async () => {
    let requestedUrl = '';
    server.use(
      http.get('/api/history', ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ items: [], page: 1, page_size: 20, total: 0 });
      })
    );
    render(<RepositoryPage initialSearchParams={{}} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'tea');
    await user.selectOptions(screen.getByLabelText('Mode'), 'ecommerce_listing');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(requestedUrl).toContain('q=tea'));
    expect(requestedUrl).toContain('mode=ecommerce_listing');
    expect(mockRouter.replace).toHaveBeenCalledWith(
      expect.stringMatching(/\/history\?.*q=tea.*mode=ecommerce_listing/),
      { scroll: false }
    );
  });

  it('provides a visible table alternative for status charts', () => {
    render(<StatusChart counts={{ pass: 4, fail: 2, mixed: 1, manual_review: 3 }} />);
    expect(screen.getByRole('table', { name: 'Scan status data' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '4' })).toBeInTheDocument();
  });

  it('does not expose user administration to inspectors', () => {
    render(
      <WorkspaceShell user={INSPECTOR}>
        <div>Workspace content</div>
      </WorkspaceShell>
    );
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('clears a password after a failed reset and displays the backend conflict', async () => {
    server.use(
      http.patch('/api/users/1', () =>
        HttpResponse.json(
          { error: 'last_admin_required', detail: 'At least one active admin is required.' },
          { status: 409 }
        )
      )
    );
    render(<UserTable initialUsers={USERS} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Manage Administrator' }));
    await user.type(screen.getByLabelText('New password'), 'Strong password 2026!');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'At least one active admin is required.'
    );
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });
});
