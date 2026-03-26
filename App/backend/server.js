const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { stmts, DATA_DIR } = require('./db');
const worktree = require('./git/worktree');
const review = require('./git/review');
const { addClient, broadcast } = require('./streaming/sse');
const { checkRateLimit, getUsageSummary } = require('./proxy/router');
const ClaudeAgent = require('./agents/claude-agent');
const GptAgent = require('./agents/gpt-agent');
const MinimaxAgent = require('./agents/minimax-agent');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// Active agent instances (in-memory)
const activeAgents = new Map();

function uid() { return crypto.randomUUID(); }

// ============ SSE ============
app.get('/events', (req, res) => {
  addClient(res);
});

// ============ REPOS ============
app.get('/api/repos', (req, res) => {
  res.json(stmts.getAllRepos.all());
});

app.post('/api/repos', async (req, res) => {
  const { url, name, localPath } = req.body;
  const id = uid();

  try {
    let repoPath = localPath;

    if (url && !localPath) {
      const repoName = name || url.split('/').pop().replace('.git', '');
      repoPath = path.join(DATA_DIR, 'repos', repoName);
      broadcast({ type: 'repo_cloning', id, name: repoName });
      await worktree.cloneRepo(url, repoPath);
    }

    const defaultBranch = worktree.getDefaultBranch(repoPath);
    const repoName = name || path.basename(repoPath);

    stmts.insertRepo.run(id, repoName, url || '', repoPath, defaultBranch);
    const repo = stmts.getRepo.get(id);

    broadcast({ type: 'repo_added', repo });
    res.json(repo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/repos/:id', (req, res) => {
  const repo = stmts.getRepo.get(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });

  const workspaces = stmts.getWorkspacesByRepo.all(repo.id);
  for (const ws of workspaces) {
    const agent = activeAgents.get(ws.id);
    if (agent) agent.stop();
    try { worktree.remove(repo.local_path, repo.name, ws.name); } catch { /* ignore */ }
  }

  stmts.deleteRepo.run(repo.id);
  broadcast({ type: 'repo_deleted', id: repo.id });
  res.json({ ok: true });
});

// ============ WORKSPACES ============
app.get('/api/workspaces', (req, res) => {
  res.json(stmts.getAllWorkspaces.all());
});

app.get('/api/workspaces/:id', (req, res) => {
  const ws = stmts.getWorkspace.get(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });

  const files = worktree.getChangedFiles(ws.worktree_path);
  const tasks = stmts.getTasksByWorkspace.all(ws.id);
  const agent = activeAgents.get(ws.id);

  res.json({ ...ws, files, tasks, agentStatus: agent?.getStatus() });
});

app.post('/api/workspaces', async (req, res) => {
  const { repoId, name } = req.body;
  const repo = stmts.getRepo.get(repoId);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });

  const id = uid();
  const wsName = name || `ws-${Date.now()}`;

  try {
    const { branch, path: wtPath } = await worktree.create(repo.local_path, repo.name, wsName);
    stmts.insertWorkspace.run(id, repoId, wsName, branch, wtPath);

    const ws = stmts.getWorkspace.get(id);
    broadcast({ type: 'workspace_created', workspace: { ...ws, repo_name: repo.name } });
    res.json(ws);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workspaces/:id', (req, res) => {
  const ws = stmts.getWorkspace.get(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });

  const agent = activeAgents.get(ws.id);
  if (agent) agent.stop();
  activeAgents.delete(ws.id);

  const repo = stmts.getRepo.get(ws.repo_id);
  if (repo) {
    try { worktree.remove(repo.local_path, repo.name, ws.name); } catch { /* ignore */ }
  }

  stmts.deleteWorkspace.run(ws.id);
  broadcast({ type: 'workspace_deleted', id: ws.id });
  res.json({ ok: true });
});

// ============ AGENT SPAWNING ============
app.post('/api/workspaces/:id/spawn', (req, res) => {
  const ws = stmts.getWorkspace.get(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });

  if (activeAgents.has(ws.id)) {
    return res.status(409).json({ error: 'Agent already running in this workspace' });
  }

  const { model = 'claude', task, options = {} } = req.body;
  if (!task) return res.status(400).json({ error: 'Task is required' });

  const rateCheck = checkRateLimit(model);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: rateCheck.reason });
  }

  const runId = uid();
  stmts.insertRun.run(runId, ws.id, model, task);

  let agent;
  switch (model) {
    case 'claude':
    case 'claude-opus':
      agent = new ClaudeAgent(runId, ws.id, task, ws.worktree_path, { ...options, model });
      break;
    case 'gpt':
    case 'gpt-o1':
      agent = new GptAgent(runId, ws.id, task, ws.worktree_path, { ...options, model });
      break;
    case 'minimax':
      agent = new MinimaxAgent(runId, ws.id, task, ws.worktree_path, { ...options, model });
      break;
    default:
      return res.status(400).json({ error: `Unknown model: ${model}` });
  }

  agent.on('output', (data) => broadcast({ type: 'agent_output', ...data }));
  agent.on('complete', (data) => {
    activeAgents.delete(ws.id);
    broadcast({ type: 'agent_complete', ...data });
  });

  activeAgents.set(ws.id, agent);
  agent.start();

  broadcast({ type: 'agent_spawned', runId, workspaceId: ws.id, model, task });
  res.json({ runId, pid: agent.pid, model });
});

app.post('/api/workspaces/:id/kill', (req, res) => {
  const agent = activeAgents.get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'No running agent in this workspace' });

  agent.stop();
  activeAgents.delete(req.params.id);
  res.json({ ok: true });
});

// ============ TASKS ============
app.get('/api/workspaces/:id/tasks', (req, res) => {
  res.json(stmts.getTasksByWorkspace.all(req.params.id));
});

app.post('/api/workspaces/:id/tasks', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Task text is required' });

  const id = uid();
  stmts.insertTask.run(id, req.params.id, text);

  const task = { id, workspace_id: req.params.id, text, completed: 0 };
  broadcast({ type: 'task_added', workspaceId: req.params.id, task });
  res.json(task);
});

app.patch('/api/tasks/:id/complete', (req, res) => {
  stmts.completeTask.run(req.params.id);
  broadcast({ type: 'task_completed', taskId: req.params.id });
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  stmts.deleteTask.run(req.params.id);
  broadcast({ type: 'task_deleted', taskId: req.params.id });
  res.json({ ok: true });
});

// ============ CODE REVIEW ============
app.get('/api/workspaces/:id/diff', (req, res) => {
  const ws = stmts.getWorkspace.get(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });

  const repo = stmts.getRepo.get(ws.repo_id);
  const diff = review.getDiff(repo.local_path, ws.branch);
  const stat = review.getDiffStat(repo.local_path, ws.branch);
  const commits = review.getCommitLog(repo.local_path, ws.branch);

  res.json({ diff, ...stat, commits });
});

app.get('/api/workspaces/:id/diff/:file(*)', (req, res) => {
  const ws = stmts.getWorkspace.get(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });

  const repo = stmts.getRepo.get(ws.repo_id);
  const diff = review.getDiffByFile(repo.local_path, ws.branch, req.params.file);
  res.json({ diff });
});

app.post('/api/workspaces/:id/review', (req, res) => {
  const ws = stmts.getWorkspace.get(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });

  const repo = stmts.getRepo.get(ws.repo_id);
  const stat = review.getDiffStat(repo.local_path, ws.branch);

  const id = uid();
  stmts.insertReview.run(id, ws.id, stat.summary, stat.filesChanged, stat.insertions, stat.deletions);
  stmts.updateWorkspaceStatus.run('reviewing', ws.id);

  const rev = stmts.getReview.get(id);
  broadcast({ type: 'review_created', review: rev });
  res.json(rev);
});

app.post('/api/reviews/:id/merge', (req, res) => {
  const rev = stmts.getReview.get(req.params.id);
  if (!rev) return res.status(404).json({ error: 'Review not found' });

  const ws = stmts.getWorkspace.get(rev.workspace_id);
  const repo = stmts.getRepo.get(ws.repo_id);

  const message = req.body.message || `Merge ${ws.branch}: ${ws.name}`;
  const result = review.merge(repo.local_path, ws.branch, message);

  if (result.success) {
    stmts.updateReviewStatus.run('merged', 'merged', rev.id);
    stmts.updateWorkspaceStatus.run('merged', ws.id);
    broadcast({ type: 'review_merged', reviewId: rev.id, workspaceId: ws.id });
    res.json({ ok: true });
  } else {
    res.status(409).json(result);
  }
});

app.post('/api/reviews/:id/reject', (req, res) => {
  const rev = stmts.getReview.get(req.params.id);
  if (!rev) return res.status(404).json({ error: 'Review not found' });

  stmts.updateReviewStatus.run('rejected', 'rejected', rev.id);
  stmts.updateWorkspaceStatus.run('idle', rev.workspace_id);

  broadcast({ type: 'review_rejected', reviewId: rev.id });
  res.json({ ok: true });
});

// ============ DASHBOARD ============
app.get('/api/dashboard', (req, res) => {
  const stats = stmts.getDashboard.get();
  const activeRuns = stmts.getActiveRuns.all();
  const workspaces = stmts.getAllWorkspaces.all();

  const enrichedRuns = activeRuns.map(run => ({
    ...run,
    live: activeAgents.has(run.workspace_id) ? activeAgents.get(run.workspace_id).getStatus() : null,
  }));

  res.json({ stats, activeRuns: enrichedRuns, workspaces });
});

app.get('/api/proxy/usage', (req, res) => {
  res.json(getUsageSummary());
});

// ============ AGENT OUTPUT HISTORY ============
app.get('/api/runs/:id/output', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const output = stmts.getRecentOutput.all(req.params.id, limit);
  res.json(output.reverse());
});

app.get('/api/workspaces/:id/runs', (req, res) => {
  res.json(stmts.getRunsByWorkspace.all(req.params.id));
});

// ============ FALLBACK: SERVE FRONTEND ============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

// ============ START ============
const PORT = process.env.HERMES_PORT || 8765;

function start() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Hermes running on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Hermes] Shutting down...');
  for (const [id, agent] of activeAgents) {
    agent.stop();
  }
  process.exit(0);
});

module.exports = { app, start, PORT };
