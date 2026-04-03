/**
 * Dashboard — main application shell.
 *
 * Scenario target (JSX edit):
 *  - Add a `<NotificationBanner />` component just below the <Header />
 *  - Change the sidebar default collapse breakpoint from 'lg' to 'md'
 *  - Add an `onError` prop to <DataTable /> call with an inline handler
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BreakPoint = 'sm' | 'md' | 'lg' | 'xl';

interface User {
	id: string;
	name: string;
	email: string;
	avatarUrl: string | null;
	role: 'admin' | 'editor' | 'viewer';
}

interface Notification {
	id: string;
	kind: 'info' | 'warning' | 'error' | 'success';
	message: string;
	dismissedAt: number | null;
}

interface DashboardState {
	user: User | null;
	notifications: Notification[];
	sidebarOpen: boolean;
	theme: 'light' | 'dark' | 'system';
	activeSection: string;
}

type DashboardAction =
	| { type: 'SET_USER'; payload: User }
	| { type: 'TOGGLE_SIDEBAR' }
	| { type: 'SET_THEME'; payload: DashboardState['theme'] }
	| { type: 'NAVIGATE'; payload: string }
	| { type: 'ADD_NOTIFICATION'; payload: Notification }
	| { type: 'DISMISS_NOTIFICATION'; payload: string };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
	switch (action.type) {
		case 'SET_USER':
			return { ...state, user: action.payload };
		case 'TOGGLE_SIDEBAR':
			return { ...state, sidebarOpen: !state.sidebarOpen };
		case 'SET_THEME':
			return { ...state, theme: action.payload };
		case 'NAVIGATE':
			return { ...state, activeSection: action.payload };
		case 'ADD_NOTIFICATION':
			return { ...state, notifications: [...state.notifications, action.payload] };
		case 'DISMISS_NOTIFICATION':
			return {
				...state,
				notifications: state.notifications.map((n) =>
					n.id === action.payload ? { ...n, dismissedAt: Date.now() } : n,
				),
			};
		default:
			return state;
	}
}

const INITIAL_STATE: DashboardState = {
	user: null,
	notifications: [],
	sidebarOpen: true,
	theme: 'system',
	activeSection: 'overview',
};

// ---------------------------------------------------------------------------
// Sub-components (stubs for fixture purposes)
// ---------------------------------------------------------------------------

function Header({ user, onToggleSidebar }: { user: User | null; onToggleSidebar: () => void }) {
	return (
		<header className="flex h-14 items-center border-b bg-surface px-4 gap-3">
			<button
				type="button"
				aria-label="Toggle sidebar"
				onClick={onToggleSidebar}
				className="rounded p-1.5 hover:bg-muted"
			>
				<span className="icon-menu" />
			</button>
			<span className="font-semibold text-sm flex-1">Platform</span>
			{user != null && (
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted">{user.name}</span>
					{user.avatarUrl != null
						? <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
						: <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-medium">
								{user.name[0]}
							</div>
					}
				</div>
			)}
		</header>
	);
}

function Sidebar({
	open,
	activeSection,
	onNavigate,
	collapseBreakpoint = 'lg',
}: {
	open: boolean;
	activeSection: string;
	onNavigate: (section: string) => void;
	collapseBreakpoint?: BreakPoint;
}) {
	const sections = [
		{ id: 'overview', label: 'Overview', icon: 'icon-home' },
		{ id: 'analytics', label: 'Analytics', icon: 'icon-chart' },
		{ id: 'users', label: 'Users', icon: 'icon-users' },
		{ id: 'settings', label: 'Settings', icon: 'icon-settings' },
	];

	return (
		<aside
			data-open={open}
			data-collapse-at={collapseBreakpoint}
			className="w-56 shrink-0 border-r bg-surface flex flex-col py-2 data-[open=false]:hidden"
		>
			{sections.map((section) => (
				<button
					key={section.id}
					type="button"
					onClick={() => onNavigate(section.id)}
					aria-current={activeSection === section.id ? 'page' : undefined}
					className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-muted aria-[current=page]:bg-accent/10 aria-[current=page]:font-medium"
				>
					<span className={section.icon} aria-hidden />
					{section.label}
				</button>
			))}
		</aside>
	);
}

interface Column<T> {
	key: keyof T;
	header: string;
	render?: (value: T[keyof T], row: T) => React.ReactNode;
}

function DataTable<T extends { id: string }>({
	data,
	columns,
	loading,
	emptyMessage = 'No data.',
}: {
	data: T[];
	columns: Column<T>[];
	loading?: boolean;
	emptyMessage?: string;
}) {
	if (loading) {
		return <div className="flex items-center justify-center h-32 text-muted text-sm">Loading…</div>;
	}

	if (data.length === 0) {
		return <div className="flex items-center justify-center h-32 text-muted text-sm">{emptyMessage}</div>;
	}

	return (
		<div className="overflow-auto rounded border">
			<table className="w-full text-sm">
				<thead className="bg-muted/50">
					<tr>
						{columns.map((col) => (
							<th key={String(col.key)} className="px-4 py-2.5 text-left font-medium text-muted-foreground">
								{col.header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{data.map((row) => (
						<tr key={row.id} className="border-t hover:bg-muted/30">
							{columns.map((col) => (
								<td key={String(col.key)} className="px-4 py-2.5">
									{col.render != null ? col.render(row[col.key], row) : String(row[col.key])}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Overview section
// ---------------------------------------------------------------------------

function OverviewSection({ user }: { user: User | null }) {
	const [rows, setRows] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// Simulate async fetch
		const timer = setTimeout(() => {
			setRows(user != null ? [user] : []);
			setLoading(false);
		}, 600);
		return () => clearTimeout(timer);
	}, [user]);

	const columns: Column<User>[] = [
		{ key: 'name', header: 'Name' },
		{ key: 'email', header: 'Email' },
		{ key: 'role', header: 'Role', render: (v) => <span className="capitalize">{String(v)}</span> },
	];

	return (
		<section className="p-6 flex flex-col gap-4">
			<h2 className="text-lg font-semibold">Overview</h2>
			<DataTable
				data={rows}
				columns={columns}
				loading={loading}
				emptyMessage="No users found."
			/>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Dashboard (root component)
// ---------------------------------------------------------------------------

export interface DashboardProps {
	initialUser?: User;
	onSessionExpired?: () => void;
}

export function Dashboard({ initialUser, onSessionExpired }: DashboardProps) {
	const [state, dispatch] = useReducer(dashboardReducer, {
		...INITIAL_STATE,
		user: initialUser ?? null,
	});

	const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Session expiry timer — reset on any user interaction
	const resetSessionTimer = useCallback(() => {
		if (sessionTimerRef.current != null) clearTimeout(sessionTimerRef.current);
		sessionTimerRef.current = setTimeout(() => {
			onSessionExpired?.();
		}, 30 * 60 * 1000); // 30-minute idle timeout
	}, [onSessionExpired]);

	useEffect(() => {
		resetSessionTimer();
		window.addEventListener('mousemove', resetSessionTimer);
		window.addEventListener('keydown', resetSessionTimer);
		return () => {
			window.removeEventListener('mousemove', resetSessionTimer);
			window.removeEventListener('keydown', resetSessionTimer);
			if (sessionTimerRef.current != null) clearTimeout(sessionTimerRef.current);
		};
	}, [resetSessionTimer]);

	// Sync theme preference to <html> data attribute
	useEffect(() => {
		document.documentElement.dataset['theme'] = state.theme;
	}, [state.theme]);

	const handleNavigate = useCallback((section: string) => {
		dispatch({ type: 'NAVIGATE', payload: section });
	}, []);

	const handleToggleSidebar = useCallback(() => {
		dispatch({ type: 'TOGGLE_SIDEBAR' });
	}, []);

	function renderSection() {
		switch (state.activeSection) {
			case 'overview':
				return <OverviewSection user={state.user} />;
			case 'analytics':
				return <div className="p-6 text-muted text-sm">Analytics coming soon.</div>;
			case 'users':
				return <div className="p-6 text-muted text-sm">User management coming soon.</div>;
			case 'settings':
				return <div className="p-6 text-muted text-sm">Settings coming soon.</div>;
			default:
				return null;
		}
	}

	return (
		<div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
			<Header user={state.user} onToggleSidebar={handleToggleSidebar} />
			<div className="flex flex-1 overflow-hidden">
				<Sidebar
					open={state.sidebarOpen}
					activeSection={state.activeSection}
					onNavigate={handleNavigate}
					collapseBreakpoint="lg"
				/>
				<main className="flex-1 overflow-auto">
					{renderSection()}
				</main>
			</div>
		</div>
	);
}

export default Dashboard;
