import { useState, useEffect } from 'react';
import { useRepoStore, type Repo, type Workspace } from '../stores/repo';
import { useAgentStore } from '../stores/agent';
import { useUIStore } from '../stores/ui';

/* ── helpers ──────────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ── icons ────────────────────────────────────────────────────── */

function HomeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-[--color-hermes-text-muted] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function GitBranchIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3 3 3 0 00-3-3zm12-6a3 3 0 10-3 3 3 3 0 003-3zm-3 3V9a3 3 0 00-3-3H9" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.646.87a.634.634 0 00.142.056l1.277.377c.33.098.656-.068.864-.333l.831-1.098a1.142 1.142 0 011.535-.217l2.247 1.296a1.142 1.142 0 01.417 1.558l-.636 1.101c-.185.32-.18.71.019 1.024a.71.71 0 00.072.115l.774 1.03c.21.28.227.663.048.96l-1.296 2.163a1.142 1.142 0 01-1.394.48l-1.235-.48a.961.961 0 00-.89.078 6.58 6.58 0 01-.12.072.961.961 0 00-.464.787l-.04 1.32a1.142 1.142 0 01-1.096 1.087h-2.593a1.142 1.142 0 01-1.096-1.088l-.04-1.319a.961.961 0 00-.464-.787 6.58 6.58 0 01-.12-.072.961.961 0 00-.89-.078l-1.235.48a1.142 1.142 0 01-1.394-.48L3.07 16.39a1.142 1.142 0 01.048-.96l.774-1.03a.71.71 0 00.072-.115c.199-.314.204-.704.019-1.024l-.636-1.1a1.142 1.142 0 01.417-1.559l2.247-1.296a1.142 1.142 0 011.535.217l.831 1.098c.208.265.534.431.864.333l1.277-.377a.634.634 0 00.142-.056c.333-.184.583-.496.646-.87L9.594 3.94z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/* ── status indicator ─────────────────────────────────────────── */

function StatusIndicator({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'text-[--color-hermes-yellow]',
    completed: 'text-[--color-hermes-green]',
    failed: 'text-[--color-hermes-red]',
    reviewing: 'text-[--color-hermes-accent]',
    idle: 'text-[--color-hermes-text-muted]',
  };
  return (
    <GitBranchIcon className={`w-3.5 h-3.5 flex-shrink-0 ${colors[status] || colors.idle}`} />
  );
}

/* ── diff stats pill ──────────────────────────────────────────── */

function DiffStatsPill({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions === 0 && deletions === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono rounded-full px-1.5 py-0.5 bg-[--color-hermes-surface]">
      {additions > 0 && <span className="text-[--color-hermes-green]">+{additions}</span>}
      {deletions > 0 && <span className="text-[--color-hermes-red]">-{deletions}</span>}
    </span>
  );
}

/* ── workspace item ───────────────────────────────────────────── */

function WorkspaceItem({
  ws,
  selected,
  shortcut,
  onSelect,
}: {
  ws: Workspace;
  selected: boolean;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex items-start gap-2.5 px-3 py-2 mx-1 rounded-md transition-colors group ${
        selected
          ? 'bg-[--color-hermes-surface-hover]'
          : 'hover:bg-[--color-hermes-surface]/60'
      }`}
    >
      <StatusIndicator status={ws.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] truncate ${selected ? 'text-[--color-hermes-text]' : 'text-[--color-hermes-text-secondary]'}`}>
            {ws.name}
          </span>
          <DiffStatsPill additions={0} deletions={0} />
        </div>
        <div className="text-[11px] text-[--color-hermes-text-muted] mt-0.5">
          {ws.branch || 'main'} · {timeAgo(ws.updated_at || ws.created_at)}
        </div>
      </div>
      {shortcut && (
        <span className="text-[10px] text-[--color-hermes-text-muted] font-mono bg-[--color-hermes-surface] rounded px-1 py-0.5 flex-shrink-0 mt-0.5">
          {'\u2318'}{shortcut}
        </span>
      )}
    </button>
  );
}

/* ── repo section ─────────────────────────────────────────────── */

function RepoSection({
  repo,
  workspaces,
  expanded,
  onToggle,
  selectedWorkspaceId,
  onSelectWorkspace,
  onNewWorkspace,
  onDeleteRepo,
  shortcutOffset,
}: {
  repo: Repo;
  workspaces: Workspace[];
  expanded: boolean;
  onToggle: () => void;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onNewWorkspace: () => void;
  onDeleteRepo: () => void;
  shortcutOffset: number;
}) {
  return (
    <div className="mb-1">
      {/* Repo header */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-[--color-hermes-surface]/40 transition-colors group"
        onClick={onToggle}
      >
        <ChevronIcon open={expanded} />
        <span className="text-[13px] font-semibold text-[--color-hermes-text] truncate flex-1">
          {repo.name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRepo();
          }}
          className="opacity-0 group-hover:opacity-100 text-[--color-hermes-text-muted] hover:text-[--color-hermes-red] transition-all"
          title="Remove repo"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Workspace list */}
      {expanded && (
        <div className="pb-1 pl-3">
          {workspaces.map((ws, i) => (
            <WorkspaceItem
              key={ws.id}
              ws={ws}
              selected={selectedWorkspaceId === ws.id}
              shortcut={i + shortcutOffset < 9 ? String(i + shortcutOffset + 1) : undefined}
              onSelect={() => onSelectWorkspace(ws.id)}
            />
          ))}
          <button
            onClick={onNewWorkspace}
            className="flex items-center gap-2 px-3 py-1.5 mx-1 text-[12px] text-[--color-hermes-text-muted] hover:text-[--color-hermes-accent] transition-colors rounded-md hover:bg-[--color-hermes-surface]/40"
          >
            <PlusIcon />
            New workspace
          </button>
        </div>
      )}
    </div>
  );
}

/* ── modal overlay ────────────────────────────────────────────── */

function ModalOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[--color-hermes-surface] border border-[--color-hermes-border] rounded-xl p-5 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ── main sidebar ─────────────────────────────────────────────── */

export default function Sidebar() {
  const repos = useRepoStore((s) => s.repos);
  const workspaces = useRepoStore((s) => s.workspaces);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);
  const fetchWorkspaces = useRepoStore((s) => s.fetchWorkspaces);
  const addRepo = useRepoStore((s) => s.addRepo);
  const addWorkspace = useRepoStore((s) => s.addWorkspace);
  const deleteRepo = useRepoStore((s) => s.deleteRepo);
  const activeRuns = useAgentStore((s) => s.activeRuns);

  const selectedWorkspaceId = useUIStore((s) => s.selectedWorkspaceId);
  const selectWorkspace = useUIStore((s) => s.selectWorkspace);
  const setMode = useUIStore((s) => s.setMode);

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [newWsRepoId, setNewWsRepoId] = useState<string | null>(null);
  const [wsName, setWsName] = useState('');
  const [addingWs, setAddingWs] = useState(false);

  useEffect(() => {
    fetchRepos();
    fetchWorkspaces();
  }, [fetchRepos, fetchWorkspaces]);

  // Auto-expand repos on load
  useEffect(() => {
    if (repos.length > 0 && expandedRepos.size === 0) {
      setExpandedRepos(new Set(repos.map((r) => r.id)));
    }
  }, [repos, expandedRepos.size]);

  const toggleRepo = (id: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddRepo = async () => {
    if (!repoUrl.trim()) return;
    setAddingRepo(true);
    try {
      const repo = await addRepo(repoUrl.trim());
      setExpandedRepos((prev) => new Set(prev).add(repo.id));
      setRepoUrl('');
      setShowAddRepo(false);
    } catch (err) {
      console.error('Failed to add repo:', err);
    } finally {
      setAddingRepo(false);
    }
  };

  const handleAddWorkspace = async () => {
    if (!wsName.trim() || !newWsRepoId) return;
    setAddingWs(true);
    try {
      const ws = await addWorkspace(newWsRepoId, wsName.trim());
      selectWorkspace(ws.id);
      setWsName('');
      setNewWsRepoId(null);
    } catch (err) {
      console.error('Failed to add workspace:', err);
    } finally {
      setAddingWs(false);
    }
  };

  const repoWorkspaces = (repoId: string) =>
    workspaces.filter((w) => w.repo_id === repoId);

  // Running count for indicator
  const runningCount = activeRuns.filter((r) => r.status === 'running').length;

  // Shortcut offset accumulator
  let shortcutCounter = 0;

  return (
    <div className="w-[260px] h-full bg-[--color-hermes-sidebar] border-r border-[--color-hermes-border-subtle] flex flex-col flex-shrink-0">
      {/* Home link */}
      <button
        onClick={() => setMode('dashboard')}
        className="flex items-center gap-2.5 px-4 py-3 text-[--color-hermes-text-secondary] hover:text-[--color-hermes-text] hover:bg-[--color-hermes-surface]/40 transition-colors border-b border-[--color-hermes-border-subtle]"
      >
        <HomeIcon />
        <span className="text-[13px]">Home</span>
        {runningCount > 0 && (
          <span className="ml-auto text-[10px] font-medium bg-[--color-hermes-accent-dim] text-[--color-hermes-accent] rounded-full px-1.5 py-0.5">
            {runningCount}
          </span>
        )}
      </button>

      {/* Repos + Workspaces */}
      <div className="flex-1 overflow-y-auto py-2">
        {repos.length === 0 && (
          <div className="px-4 py-8 text-center text-[--color-hermes-text-muted] text-xs">
            No repos yet. Add one below.
          </div>
        )}
        {repos.map((repo) => {
          const wsForRepo = repoWorkspaces(repo.id);
          const offset = shortcutCounter;
          shortcutCounter += wsForRepo.length;
          return (
            <RepoSection
              key={repo.id}
              repo={repo}
              workspaces={wsForRepo}
              expanded={expandedRepos.has(repo.id)}
              onToggle={() => toggleRepo(repo.id)}
              selectedWorkspaceId={selectedWorkspaceId}
              onSelectWorkspace={(id) => selectWorkspace(id)}
              onNewWorkspace={() => {
                setNewWsRepoId(repo.id);
                setWsName('');
              }}
              onDeleteRepo={() => deleteRepo(repo.id)}
              shortcutOffset={offset}
            />
          );
        })}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[--color-hermes-border-subtle] px-3 py-2.5 flex items-center gap-2">
        <button
          onClick={() => setShowAddRepo(true)}
          className="flex items-center gap-2 flex-1 px-2 py-1.5 text-[12px] text-[--color-hermes-text-muted] hover:text-[--color-hermes-text] hover:bg-[--color-hermes-surface]/60 rounded-md transition-colors"
        >
          <PlusIcon />
          Add repository
        </button>
        <button className="p-1.5 text-[--color-hermes-text-muted] hover:text-[--color-hermes-text] hover:bg-[--color-hermes-surface]/60 rounded-md transition-colors">
          <SettingsIcon />
        </button>
      </div>

      {/* Add Repo Modal */}
      {showAddRepo && (
        <ModalOverlay onClose={() => setShowAddRepo(false)}>
          <h3 className="text-sm font-semibold text-[--color-hermes-text] mb-3">Add Repository</h3>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="w-full bg-[--color-hermes-bg] border border-[--color-hermes-border] rounded-lg px-3 py-2 text-sm text-[--color-hermes-text] placeholder-[--color-hermes-text-muted] focus:outline-none focus:border-[--color-hermes-accent]/50 mb-3"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddRepo(false)}
              className="px-3 py-1.5 text-xs text-[--color-hermes-text-secondary] hover:text-[--color-hermes-text]"
            >
              Cancel
            </button>
            <button
              onClick={handleAddRepo}
              disabled={!repoUrl.trim() || addingRepo}
              className="px-4 py-1.5 text-xs bg-[--color-hermes-accent] text-black font-medium rounded-lg hover:brightness-110 disabled:opacity-50"
            >
              {addingRepo ? 'Adding...' : 'Add'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* New Workspace Modal */}
      {newWsRepoId && (
        <ModalOverlay onClose={() => setNewWsRepoId(null)}>
          <h3 className="text-sm font-semibold text-[--color-hermes-text] mb-3">New Workspace</h3>
          <input
            type="text"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="workspace-name"
            className="w-full bg-[--color-hermes-bg] border border-[--color-hermes-border] rounded-lg px-3 py-2 text-sm text-[--color-hermes-text] placeholder-[--color-hermes-text-muted] focus:outline-none focus:border-[--color-hermes-accent]/50 mb-3"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddWorkspace()}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setNewWsRepoId(null)}
              className="px-3 py-1.5 text-xs text-[--color-hermes-text-secondary] hover:text-[--color-hermes-text]"
            >
              Cancel
            </button>
            <button
              onClick={handleAddWorkspace}
              disabled={!wsName.trim() || addingWs}
              className="px-4 py-1.5 text-xs bg-[--color-hermes-accent] text-black font-medium rounded-lg hover:brightness-110 disabled:opacity-50"
            >
              {addingWs ? 'Creating...' : 'Create'}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
