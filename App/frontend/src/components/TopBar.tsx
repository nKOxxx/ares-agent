import { useUIStore } from '../stores/ui';
import { useRepoStore } from '../stores/repo';
import { useAgentStore } from '../stores/agent';

function GitBranchIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3 3 3 0 00-3-3zm12-6a3 3 0 10-3 3 3 3 0 003-3zm-3 3V9a3 3 0 00-3-3H9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-[--color-hermes-green]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin text-[--color-hermes-yellow]" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

export default function TopBar() {
  const selectedId = useUIStore((s) => s.selectedWorkspaceId);
  const workspaces = useRepoStore((s) => s.workspaces);
  const repos = useRepoStore((s) => s.repos);
  const activeRuns = useAgentStore((s) => s.activeRuns);
  const fetchDashboard = useAgentStore((s) => s.fetchDashboard);

  const workspace = workspaces.find((w) => w.id === selectedId);
  const repo = repos.find((r) => r.id === workspace?.repo_id);
  const run = activeRuns.find((r) => r.workspace_id === selectedId);
  const isRunning = workspace?.status === 'running';
  const isCompleted = workspace?.status === 'completed';

  if (!workspace) return null;

  return (
    <div className="flex items-center justify-between h-10 px-4 border-b border-[--color-hermes-border-subtle] bg-[--color-hermes-bg] flex-shrink-0">
      {/* Left: workspace identifier */}
      <div className="flex items-center gap-2 min-w-0">
        <GitBranchIcon />
        <span className="text-[13px] text-[--color-hermes-text] truncate">
          {workspace.name}
        </span>
        {isCompleted && <CheckIcon />}
        {isRunning && <SpinnerIcon />}
      </div>

      {/* Center: branch pill */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-mono bg-[--color-hermes-surface] border border-[--color-hermes-border] rounded-full px-2.5 py-0.5 text-[--color-hermes-text-secondary]">
          /{workspace.branch || 'main'}
        </span>
      </div>

      {/* Right: status + actions */}
      <div className="flex items-center gap-3 text-[12px]">
        {run && (
          <span className={`flex items-center gap-1.5 ${isRunning ? 'text-[--color-hermes-yellow]' : 'text-[--color-hermes-text-secondary]'}`}>
            {isRunning && <SpinnerIcon />}
            {run.model && (
              <span className="font-medium">{run.model}</span>
            )}
          </span>
        )}
        {repo && (
          <span className="text-[--color-hermes-text-muted]">{repo.name}</span>
        )}
        <button
          onClick={() => fetchDashboard()}
          className="p-1 text-[--color-hermes-text-muted] hover:text-[--color-hermes-text] transition-colors rounded"
          title="Refresh"
        >
          <RefreshIcon />
        </button>
      </div>
    </div>
  );
}
