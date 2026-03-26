import { useState } from 'react';
import { useAgentStore } from '../stores/agent';
import { useUIStore } from '../stores/ui';
import { useRepoStore } from '../stores/repo';

const MODELS = [
  { id: 'claude', label: 'Claude', badge: 'bg-[--color-hermes-accent]' },
  { id: 'gpt', label: 'GPT', badge: 'bg-[--color-hermes-green]' },
  { id: 'minimax', label: 'MiniMax', badge: 'bg-violet-400' },
] as const;

export default function SpawnModal() {
  const open = useUIStore((s) => s.spawnModalOpen);
  const setOpen = useUIStore((s) => s.setSpawnModalOpen);
  const selectedId = useUIStore((s) => s.selectedWorkspaceId);
  const spawnAgent = useAgentStore((s) => s.spawnAgent);
  const updateWorkspace = useRepoStore((s) => s.updateWorkspace);

  const [model, setModel] = useState<string>('claude');
  const [task, setTask] = useState('');
  const [maxTurns, setMaxTurns] = useState(25);
  const [temperature, setTemperature] = useState(0.7);
  const [spawning, setSpawning] = useState(false);

  if (!open || !selectedId) return null;

  const handleSpawn = async () => {
    if (!task.trim()) return;
    setSpawning(true);
    try {
      const options: Record<string, unknown> = {};
      if (model === 'claude') {
        options.max_turns = maxTurns;
      } else {
        options.temperature = temperature;
      }
      await spawnAgent(selectedId, model, task, options);
      updateWorkspace(selectedId, { status: 'running', model, task });
      setTask('');
      setOpen(false);
    } catch (err) {
      console.error('Spawn failed:', err);
    } finally {
      setSpawning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-[--color-hermes-surface] border border-[--color-hermes-border] rounded-xl w-full max-w-lg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[--color-hermes-text] mb-5">Spawn Agent</h2>

        {/* Model selector */}
        <div className="mb-5">
          <label className="text-[12px] text-[--color-hermes-text-secondary] mb-2 block font-medium uppercase tracking-wide">
            Model
          </label>
          <div className="flex gap-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all border ${
                  model === m.id
                    ? `${m.badge} text-black border-transparent`
                    : 'bg-[--color-hermes-bg] border-[--color-hermes-border] text-[--color-hermes-text-secondary] hover:border-[--color-hermes-text-muted]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task input */}
        <div className="mb-5">
          <label className="text-[12px] text-[--color-hermes-text-secondary] mb-2 block font-medium uppercase tracking-wide">
            Task
          </label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe what the agent should do..."
            className="w-full h-32 bg-[--color-hermes-bg] border border-[--color-hermes-border] rounded-lg p-3 text-[13px] text-[--color-hermes-text] placeholder-[--color-hermes-text-muted] resize-none focus:outline-none focus:border-[--color-hermes-accent]/50 transition-colors"
            autoFocus
          />
        </div>

        {/* Model-specific options */}
        {model === 'claude' ? (
          <div className="mb-6">
            <label className="text-[12px] text-[--color-hermes-text-secondary] mb-2 block">
              Max Turns: <span className="text-[--color-hermes-text]">{maxTurns}</span>
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-full accent-[--color-hermes-accent]"
            />
          </div>
        ) : (
          <div className="mb-6">
            <label className="text-[12px] text-[--color-hermes-text-secondary] mb-2 block">
              Temperature: <span className="text-[--color-hermes-text]">{temperature.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-[--color-hermes-accent]"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-[13px] text-[--color-hermes-text-secondary] hover:text-[--color-hermes-text] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={!task.trim() || spawning}
            className="px-6 py-2 bg-[--color-hermes-accent] text-black text-[13px] font-medium rounded-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {spawning ? 'Spawning...' : 'Spawn'}
          </button>
        </div>
      </div>
    </div>
  );
}
