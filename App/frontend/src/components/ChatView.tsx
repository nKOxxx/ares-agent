import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../stores/ui';
import { useRepoStore } from '../stores/repo';
import { useAgentStore, type OutputLine } from '../stores/agent';
import { api } from '../hooks/useAPI';

/* ── icons ────────────────────────────────────────────────────── */

function TerminalIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}

/* ── message grouping ─────────────────────────────────────────── */

interface MessageGroup {
  type: 'user' | 'agent';
  lines: OutputLine[];
  toolCallCount: number;
  messageCount: number;
}

function groupMessages(lines: OutputLine[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let current: MessageGroup | null = null;

  for (const line of lines) {
    const isAgent = line.type === 'tool_use' || line.type === 'system' || line.type === 'result';
    const groupType = isAgent ? 'agent' : 'user';

    // If it's a user-typed 'text' that starts with '>' or has no prior context, treat as user message
    // Otherwise group as agent output
    const effectiveType = (line.type === 'text' && current?.type === 'agent' ? 'agent' : groupType) as 'user' | 'agent';

    if (!current || current.type !== effectiveType) {
      current = { type: effectiveType, lines: [], toolCallCount: 0, messageCount: 0 };
      groups.push(current);
    }

    current!.lines.push(line);
    if (line.type === 'tool_use') current!.toolCallCount++;
    if (line.type === 'text' || line.type === 'result') current!.messageCount++;
  }

  return groups;
}

/* ── message components ───────────────────────────────────────── */

function UserMessage({ lines }: { lines: OutputLine[] }) {
  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[80%] bg-[--color-hermes-surface] border border-[--color-hermes-border] rounded-2xl rounded-br-md px-4 py-3">
        {lines.map((line, i) => (
          <p key={i} className="text-[13px] text-[--color-hermes-text] whitespace-pre-wrap break-words">
            {highlightMentions(line.content)}
          </p>
        ))}
      </div>
    </div>
  );
}

function AgentMessage({ group }: { group: MessageGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[12px] text-[--color-hermes-text-secondary] hover:text-[--color-hermes-text] mb-2 transition-colors"
      >
        <ChevronDownIcon />
        {group.toolCallCount > 0 && (
          <span className="flex items-center gap-1">
            <TerminalIcon />
            {group.toolCallCount} tool call{group.toolCallCount !== 1 ? 's' : ''}
          </span>
        )}
        {group.messageCount > 0 && (
          <span className="flex items-center gap-1">
            <FileIcon />
            {group.messageCount} message{group.messageCount !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-1.5 ml-1 pl-3 border-l-2 border-[--color-hermes-border]">
          {group.lines.map((line, i) => (
            <AgentOutputLine key={i} line={line} />
          ))}
        </div>
      )}

      {/* Always show last result/text line as preview */}
      {!expanded && (
        <div className="ml-1 pl-3 border-l-2 border-[--color-hermes-border]">
          {group.lines.filter((l) => l.type === 'result' || l.type === 'text').slice(-1).map((line, i) => (
            <AgentOutputLine key={i} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentOutputLine({ line }: { line: OutputLine }) {
  const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    tool_use: { icon: <TerminalIcon />, color: 'text-[--color-hermes-accent]' },
    error: { icon: <span className="text-[10px] font-bold">!</span>, color: 'text-[--color-hermes-red]' },
    system: { icon: <span className="text-[10px]">sys</span>, color: 'text-[--color-hermes-text-muted]' },
    result: { icon: <FileIcon />, color: 'text-[--color-hermes-green]' },
    text: { icon: null, color: 'text-[--color-hermes-text]' },
  };

  const config = typeConfig[line.type] || typeConfig.text;

  // Check for inline diff content
  const hasDiff = line.content.includes('\n+') || line.content.includes('\n-');

  return (
    <div className={`text-[13px] ${config.color} py-0.5`}>
      <div className="flex items-start gap-2">
        {config.icon && <span className="mt-0.5 flex-shrink-0">{config.icon}</span>}
        <div className="min-w-0 flex-1">
          {hasDiff ? (
            <pre className="font-mono text-[12px] leading-5 whitespace-pre-wrap break-all">
              {line.content.split('\n').map((l, i) => {
                let lineColor = '';
                let bg = '';
                if (l.startsWith('+')) {
                  lineColor = 'text-[--color-hermes-green]';
                  bg = 'bg-[--color-hermes-diff-add]';
                } else if (l.startsWith('-')) {
                  lineColor = 'text-[--color-hermes-red]';
                  bg = 'bg-[--color-hermes-diff-del]';
                }
                return (
                  <span key={i} className={`${lineColor} ${bg} block px-1`}>{l}{'\n'}</span>
                );
              })}
            </pre>
          ) : (
            <span className="whitespace-pre-wrap break-words">{line.content}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── highlight @mentions ──────────────────────────────────────── */

function highlightMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\w[\w./\-]*)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-[--color-hermes-accent] font-medium bg-[--color-hermes-accent-dim] rounded px-0.5">
        {part}
      </span>
    ) : (
      part
    )
  );
}

/* ── main chat view ───────────────────────────────────────────── */

export default function ChatView() {
  const selectedId = useUIStore((s) => s.selectedWorkspaceId);
  const setSpawnModalOpen = useUIStore((s) => s.setSpawnModalOpen);
  const workspace = useRepoStore((s) => s.workspaces.find((w) => w.id === selectedId));
  const updateWorkspace = useRepoStore((s) => s.updateWorkspace);
  const outputBuffers = useAgentStore((s) => s.outputBuffers);
  const killAgent = useAgentStore((s) => s.killAgent);

  const [taskInput, setTaskInput] = useState('');
  const [killing, setKilling] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines = (selectedId ? outputBuffers.get(selectedId) : undefined) ?? [];
  const groups = groupMessages(lines);
  const isRunning = workspace?.status === 'running';

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [lines]);

  // Track scroll position for "scroll to bottom" button
  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
    }
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleKill = async () => {
    if (!selectedId) return;
    setKilling(true);
    try {
      await killAgent(selectedId);
      updateWorkspace(selectedId, { status: 'idle' });
    } finally {
      setKilling(false);
    }
  };

  const handleSend = async () => {
    if (!selectedId || !taskInput.trim()) return;
    try {
      await api('POST', `/api/workspaces/${selectedId}/tasks`, {
        title: taskInput.trim(),
      });
      setTaskInput('');
    } catch (err) {
      console.error('Failed to send:', err);
    }
  };

  if (!selectedId || !workspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-[--color-hermes-text-muted] text-sm">
        Select a workspace from the sidebar
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Chat messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[--color-hermes-text-muted]">
            <div className="text-4xl mb-3 opacity-30">{'>'}_</div>
            <div className="text-sm">No activity yet. Spawn an agent to get started.</div>
            <button
              onClick={() => setSpawnModalOpen(true)}
              className="mt-4 px-4 py-2 text-sm bg-[--color-hermes-accent] text-black font-medium rounded-lg hover:brightness-110 transition-all"
            >
              Spawn Agent
            </button>
          </div>
        ) : (
          groups.map((group, i) =>
            group.type === 'user' ? (
              <UserMessage key={i} lines={group.lines} />
            ) : (
              <AgentMessage key={i} group={group} />
            )
          )
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-[--color-hermes-surface] border border-[--color-hermes-border] rounded-full text-[12px] text-[--color-hermes-text-secondary] hover:text-[--color-hermes-text] shadow-lg transition-colors"
        >
          <ArrowDownIcon />
          Scroll to bottom
        </button>
      )}

      {/* Composer area */}
      <div className="border-t border-[--color-hermes-border-subtle] bg-[--color-hermes-bg] px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Ask to make changes, @mention files, run /commands"
              className="w-full bg-[--color-hermes-surface] border border-[--color-hermes-border] rounded-xl px-4 py-2.5 text-[13px] text-[--color-hermes-text] placeholder-[--color-hermes-text-muted] focus:outline-none focus:border-[--color-hermes-accent]/50 transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[--color-hermes-text-muted] font-mono">
              {'\u2318'}L to focus
            </span>
          </div>
        </div>

        {/* Bottom row: model selector + actions */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-2">
            {/* Model selector badge */}
            <button
              onClick={() => setSpawnModalOpen(true)}
              className="flex items-center gap-1 text-[11px] font-medium text-[--color-hermes-accent] bg-[--color-hermes-accent-dim] rounded-full px-2 py-0.5 hover:brightness-125 transition-all"
            >
              <span className="text-xs">&#10022;</span>
              {workspace.model || 'Sonnet'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                onClick={handleKill}
                disabled={killing}
                className="text-[11px] text-[--color-hermes-red] hover:text-red-300 disabled:opacity-50 transition-colors"
              >
                {killing ? 'Stopping...' : '\u25A0 Stop'}
              </button>
            )}
            <button
              onClick={() => setSpawnModalOpen(true)}
              className="text-[11px] text-[--color-hermes-text-muted] hover:text-[--color-hermes-text] transition-colors"
            >
              Spawn Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
