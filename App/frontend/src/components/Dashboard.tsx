import { useEffect } from 'react';
import { useAgentStore } from '../stores/agent';
import { useRepoStore } from '../stores/repo';
import { useUIStore } from '../stores/ui';

/* ── helpers ──────────────────────────────────────────────────── */

function formatElapsed(startedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

const modelBadgeColors: Record<string, string> = {
  claude: 'bg-[--color-hermes-accent-dim] text-[--color-hermes-accent]',
  gpt: 'bg-green-400/15 text-green-400',
  minimax: 'bg-violet-400/15 text-violet-400',
};

const statusDotColors: Record<string, string> = {
  running: 'bg-[--color-hermes-yellow] animate-pulse',
  completed: 'bg-[--color-hermes-green]',
  failed: 'bg-[--color-hermes-red]',
  reviewing: 'bg-[--color-hermes-accent]',
  idle: 'bg-[--color-hermes-text-muted]',
};

const statusBorderColors: Record<string, string> = {
  running: 'border-[--color-hermes-yellow]/30',
  completed: 'border-[--color-hermes-green]/20',
  failed: 'border-[--color-hermes-red]/20',
  reviewing: 'border-[--color-hermes-accent]/30',
  idle: 'border-[--color-hermes-border]',
};

/* ── main component ───────────────────────────────────────────── */

export default function Dashboard() {
  const stats = useAgentStore((s) => s.dashboardStats);
  const activeRuns = useAgentStore((s) => s.activeRuns);
  const fetchDashboard = useAgentStore((s) => s.fetchDashboard);
  const repos = useRepoStore((s) => s.repos);
  const workspaces = useRepoStore((s) => s.workspaces);
  const selectWorkspace = useUIStore((s) => s.selectWorkspace);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const running = stats?.running ?? activeRuns.filter((r) => r.status === 'running').length;
  const completed = stats?.completed ?? activeRuns.filter((r) => r.status === 'completed').length;
  const failed = stats?.failed ?? activeRuns.filter((r) => r.status === 'failed').length;
  const totalCost = stats?.total_cost ?? 0;
  const repoMap = new Map(repos.map((r) => [r.id, r]));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-lg font-semibold text-[--color-hermes-text] mb-1">Hermes Dashboard</h1>
        <p className="text-[13px] text-[--color-hermes-text-muted]">Overview of all workspaces and agent activity</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 px-6 pb-4">
        <StatCard label="Running" value={running} color="text-[--color-hermes-yellow]" />
        <StatCard label="Completed" value={completed} color="text-[--color-hermes-green]" />
        <StatCard label="Failed" value={failed} color="text-[--color-hermes-red]" />
        <StatCard label="Total Cost" value={`$${totalCost.toFixed(2)}`} color="text-[--color-hermes-accent]" />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[--color-hermes-text-muted]">
            <div className="text-4xl mb-3 opacity-20">&#9672;</div>
            <div className="text-sm">No workspaces yet. Add a repo and create a workspace.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {workspaces.map((ws) => {
              const repo = repoMap.get(ws.repo_id);
              const run = activeRuns.find((r) => r.workspace_id === ws.id);
              const model = ws.model || run?.model || '';
              const mColors = modelBadgeColors[model] || 'bg-[--color-hermes-surface] text-[--color-hermes-text-muted]';
              const isRunning = ws.status === 'running';

              return (
                <button
                  key={ws.id}
                  onClick={() => selectWorkspace(ws.id)}
                  className={`text-left p-4 rounded-xl border bg-[--color-hermes-surface] hover:bg-[--color-hermes-surface-hover] transition-all ${
                    statusBorderColors[ws.status] || statusBorderColors.idle
                  } ${isRunning ? 'shadow-[0_0_20px_rgba(34,211,238,0.06)]' : ''}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColors[ws.status] || statusDotColors.idle}`} />
                      <span className="text-[12px] text-[--color-hermes-text-secondary]">{repo?.name || 'unknown'}</span>
                    </div>
                    {model && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${mColors}`}>
                        {model.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="text-[13px] font-medium text-[--color-hermes-text] mb-1 truncate">
                    {ws.name}
                  </h3>

                  {/* Task preview */}
                  <p className="text-[12px] text-[--color-hermes-text-muted] line-clamp-2 mb-3 min-h-[2rem]">
                    {ws.task || run?.task || 'No task assigned'}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[--color-hermes-text-muted] capitalize">{ws.status}</span>
                    {run?.started_at && (
                      <span className="text-[11px] text-[--color-hermes-text-muted]">
                        {formatElapsed(run.started_at)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── stat card ────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-[--color-hermes-surface] border border-[--color-hermes-border] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[--color-hermes-text-muted] mb-1 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
