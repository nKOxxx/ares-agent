import { useEffect, useState } from 'react';
import { api } from '../hooks/useAPI';
import { useUIStore } from '../stores/ui';
import { useRepoStore } from '../stores/repo';

interface DiffFile {
  filename: string;
  insertions: number;
  deletions: number;
  patch: string;
}

interface DiffData {
  files: DiffFile[];
  review_id?: string;
  total_insertions: number;
  total_deletions: number;
}

interface DiffViewerProps {
  embedded?: boolean;
}

export default function DiffViewer({ embedded = false }: DiffViewerProps) {
  const workspaceId = useUIStore((s) => s.selectedWorkspaceId);
  const updateWorkspace = useRepoStore((s) => s.updateWorkspace);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    api<DiffData>('GET', `/api/workspaces/${workspaceId}/diff`)
      .then((data) => {
        setDiff(data);
        if (data.files?.length > 0) {
          setSelectedFile(data.files[0].filename);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleApprove = async () => {
    if (!diff?.review_id) return;
    setActionLoading(true);
    try {
      await api('POST', `/api/reviews/${diff.review_id}/merge`);
      if (workspaceId) updateWorkspace(workspaceId, { status: 'completed' });
    } catch (err) {
      console.error('Merge failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!diff?.review_id) return;
    setActionLoading(true);
    try {
      await api('POST', `/api/reviews/${diff.review_id}/reject`);
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Empty / loading / error states
  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center h-full text-[--color-hermes-text-muted] text-[12px]">
        Select a workspace
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[--color-hermes-text-muted] text-[12px]">
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[--color-hermes-red] text-[12px]">
        {error}
      </div>
    );
  }

  if (!diff || !diff.files?.length) {
    return (
      <div className="flex items-center justify-center h-full text-[--color-hermes-text-muted] text-[12px]">
        No changes to review
      </div>
    );
  }

  const activeFile = diff.files.find((f) => f.filename === selectedFile);

  // Embedded mode (used in RightPanel) — compact, no file sidebar
  if (embedded) {
    return (
      <div className="flex flex-col h-full">
        {/* File tabs */}
        <div className="flex items-center gap-1 px-2 py-1 overflow-x-auto">
          {diff.files.map((file) => (
            <button
              key={file.filename}
              onClick={() => setSelectedFile(file.filename)}
              className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded whitespace-nowrap transition-colors ${
                selectedFile === file.filename
                  ? 'bg-[--color-hermes-surface-hover] text-[--color-hermes-text]'
                  : 'text-[--color-hermes-text-muted] hover:text-[--color-hermes-text-secondary]'
              }`}
            >
              <span className="font-mono truncate max-w-[120px]">{file.filename.split('/').pop()}</span>
              <span className="inline-flex items-center gap-0.5 text-[9px]">
                <span className="text-[--color-hermes-green]">+{file.insertions}</span>
                <span className="text-[--color-hermes-red]">-{file.deletions}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto px-1">
          {activeFile && <DiffContent patch={activeFile.patch} />}
        </div>
      </div>
    );
  }

  // Full-page mode (standalone view)
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-[--color-hermes-border-subtle] bg-[--color-hermes-bg]">
        <span className="text-[13px] text-[--color-hermes-text-secondary]">
          {diff.files.length} file{diff.files.length !== 1 ? 's' : ''} changed
        </span>
        <span className="text-[13px] text-[--color-hermes-green]">+{diff.total_insertions}</span>
        <span className="text-[13px] text-[--color-hermes-red]">-{diff.total_deletions}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File list */}
        <div className="w-60 border-r border-[--color-hermes-border-subtle] bg-[--color-hermes-sidebar] overflow-y-auto">
          {diff.files.map((file) => (
            <button
              key={file.filename}
              onClick={() => setSelectedFile(file.filename)}
              className={`w-full text-left px-4 py-2.5 border-b border-[--color-hermes-border-subtle]/50 transition-colors ${
                selectedFile === file.filename
                  ? 'bg-[--color-hermes-surface-hover] text-[--color-hermes-text]'
                  : 'text-[--color-hermes-text-secondary] hover:bg-[--color-hermes-surface]/40'
              }`}
            >
              <div className="truncate font-mono text-[12px]">{file.filename}</div>
              <div className="flex gap-2 mt-1">
                <span className="text-[--color-hermes-green] text-[11px]">+{file.insertions}</span>
                <span className="text-[--color-hermes-red] text-[11px]">-{file.deletions}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto bg-[--color-hermes-bg] p-4">
          {activeFile ? (
            <DiffContent patch={activeFile.patch} />
          ) : (
            <div className="text-[--color-hermes-text-muted] text-[12px]">Select a file to view</div>
          )}
        </div>
      </div>

      {/* Actions */}
      {diff.review_id && (
        <div className="flex justify-end gap-3 px-6 py-3 border-t border-[--color-hermes-border-subtle] bg-[--color-hermes-bg]">
          <button
            onClick={handleReject}
            disabled={actionLoading}
            className="px-5 py-2 text-[13px] text-[--color-hermes-red] border border-[--color-hermes-red]/30 rounded-lg hover:bg-[--color-hermes-red]/10 disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="px-5 py-2 text-[13px] bg-[--color-hermes-green] text-black font-medium rounded-lg hover:brightness-110 disabled:opacity-50 transition-all"
          >
            Approve & Merge
          </button>
        </div>
      )}
    </div>
  );
}

/* ── diff content renderer ────────────────────────────────────── */

function DiffContent({ patch }: { patch: string }) {
  const lines = patch.split('\n');
  let lineNum = 0;

  return (
    <pre className="font-mono text-[12px] leading-5">
      {lines.map((line, i) => {
        let color = 'text-[--color-hermes-text-secondary]';
        let bg = '';
        let showLineNum = true;

        if (line.startsWith('@@')) {
          color = 'text-[--color-hermes-accent]';
          bg = 'bg-[--color-hermes-accent]/5';
          showLineNum = false;
          // Parse line number from @@ -x,y +x,y @@
          const match = line.match(/\+(\d+)/);
          if (match) lineNum = parseInt(match[1], 10) - 1;
        } else if (line.startsWith('+')) {
          color = 'text-[--color-hermes-green]';
          bg = 'bg-[--color-hermes-diff-add]';
          lineNum++;
        } else if (line.startsWith('-')) {
          color = 'text-[--color-hermes-red]';
          bg = 'bg-[--color-hermes-diff-del]';
          // Don't increment line number for deletions
        } else {
          lineNum++;
        }

        return (
          <div key={i} className={`flex ${bg} hover:brightness-125 transition-colors`}>
            {showLineNum && (
              <span className="w-10 text-right pr-3 text-[--color-hermes-text-muted]/50 select-none flex-shrink-0">
                {lineNum > 0 ? lineNum : ''}
              </span>
            )}
            {!showLineNum && <span className="w-10 flex-shrink-0" />}
            <span className={`${color} flex-1 px-2`}>{line}</span>
          </div>
        );
      })}
    </pre>
  );
}
