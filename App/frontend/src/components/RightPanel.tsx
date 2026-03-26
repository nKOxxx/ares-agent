import { useEffect, useState } from 'react';
import { useUIStore } from '../stores/ui';
import { useRepoStore } from '../stores/repo';
import { useAgentStore } from '../stores/agent';
import { api } from '../hooks/useAPI';
import Terminal from './Terminal';
import DiffViewer from './DiffViewer';

interface WorkspaceDetail {
  id: string;
  branch: string;
  status: string;
  model?: string;
  changed_files?: string[];
}

export default function RightPanel() {
  const selectedId = useUIStore((s) => s.selectedWorkspaceId);
  const workspace = useRepoStore((s) => s.workspaces.find((w) => w.id === selectedId));
  const outputBuffers = useAgentStore((s) => s.outputBuffers);

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'terminal'>('terminal');

  const lines = (selectedId ? outputBuffers.get(selectedId) : undefined) ?? [];

  // Fetch workspace detail
  useEffect(() => {
    if (!selectedId) return;
    api<WorkspaceDetail>('GET', `/api/workspaces/${selectedId}`)
      .then(setDetail)
      .catch(() => {});
  }, [selectedId, workspace?.status]);

  if (!selectedId) return null;

  return (
    <div className="w-[340px] border-l border-[--color-hermes-border-subtle] bg-[--color-hermes-bg] flex flex-col flex-shrink-0 overflow-hidden">
      {/* Top: File viewer / Diff section */}
      <div className="flex-1 min-h-0 flex flex-col border-b border-[--color-hermes-border-subtle]">
        {/* File header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[--color-hermes-border-subtle] bg-[--color-hermes-surface]/50">
          <svg className="w-3.5 h-3.5 text-[--color-hermes-text-muted]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-[12px] text-[--color-hermes-text-secondary] truncate flex-1">
            {detail?.changed_files?.[0] || 'No files changed'}
          </span>
          {detail?.changed_files && detail.changed_files.length > 0 && (
            <span className="text-[10px] text-[--color-hermes-text-muted] bg-[--color-hermes-surface] rounded px-1.5 py-0.5">
              {detail.changed_files.length} file{detail.changed_files.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto">
          <DiffViewer embedded />
        </div>
      </div>

      {/* Bottom: Terminal */}
      <div className="h-[280px] flex flex-col flex-shrink-0">
        {/* Terminal tab bar */}
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[--color-hermes-border-subtle] bg-[--color-hermes-surface]/50">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              activeTab === 'terminal'
                ? 'bg-[--color-hermes-surface-hover] text-[--color-hermes-text]'
                : 'text-[--color-hermes-text-muted] hover:text-[--color-hermes-text-secondary]'
            }`}
          >
            Run
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              activeTab === 'files'
                ? 'bg-[--color-hermes-surface-hover] text-[--color-hermes-text]'
                : 'text-[--color-hermes-text-muted] hover:text-[--color-hermes-text-secondary]'
            }`}
          >
            Term. 1
          </button>
          <div className="flex-1" />
          <button className="px-1.5 py-0.5 text-[11px] text-[--color-hermes-text-muted] hover:text-[--color-hermes-text] transition-colors">
            +
          </button>
          <span className="text-[10px] text-[--color-hermes-text-muted] font-mono mx-1">
            {'\u2318'}{'\u21E7'}O
          </span>
          {workspace?.status === 'running' && (
            <button className="px-2 py-0.5 text-[11px] text-[--color-hermes-red] hover:text-red-300 transition-colors flex items-center gap-1">
              <span className="text-[8px]">{'\u25A0'}</span> Stop
            </button>
          )}
        </div>

        {/* Terminal content */}
        <div className="flex-1 overflow-hidden">
          <Terminal lines={lines} />
        </div>
      </div>
    </div>
  );
}
