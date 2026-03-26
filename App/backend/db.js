const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'hermes');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'hermes.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema migration
db.exec(`
  CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    local_path TEXT NOT NULL,
    default_branch TEXT DEFAULT 'main',
    created_at TEXT DEFAULT (datetime('now')),
    last_synced TEXT
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    repo_id TEXT REFERENCES repos(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    branch TEXT NOT NULL,
    worktree_path TEXT,
    status TEXT DEFAULT 'idle',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(repo_id, name)
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    task TEXT NOT NULL,
    prompt TEXT,
    status TEXT DEFAULT 'pending',
    pid INTEGER,
    started_at TEXT,
    completed_at TEXT,
    exit_code INTEGER,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_estimate REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    agent_run_id TEXT REFERENCES agent_runs(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_output (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT REFERENCES agent_runs(id) ON DELETE CASCADE,
    timestamp TEXT DEFAULT (datetime('now')),
    stream TEXT,
    content TEXT,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    diff_summary TEXT,
    files_changed INTEGER DEFAULT 0,
    insertions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    merged_at TEXT
  );

  CREATE TABLE IF NOT EXISTS orchestrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orchestration_steps (
    id TEXT PRIMARY KEY,
    orchestration_id TEXT REFERENCES orchestrations(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspaces(id),
    step_order INTEGER,
    depends_on TEXT,
    model TEXT,
    task TEXT,
    status TEXT DEFAULT 'pending'
  );
`);

// Prepared statements for common operations
const stmts = {
  // Repos
  insertRepo: db.prepare('INSERT INTO repos (id, name, url, local_path, default_branch) VALUES (?, ?, ?, ?, ?)'),
  getRepo: db.prepare('SELECT * FROM repos WHERE id = ?'),
  getAllRepos: db.prepare('SELECT * FROM repos ORDER BY created_at DESC'),
  deleteRepo: db.prepare('DELETE FROM repos WHERE id = ?'),
  updateRepoSync: db.prepare(`UPDATE repos SET last_synced = datetime('now') WHERE id = ?`),

  // Workspaces
  insertWorkspace: db.prepare('INSERT INTO workspaces (id, repo_id, name, branch, worktree_path) VALUES (?, ?, ?, ?, ?)'),
  getWorkspace: db.prepare('SELECT * FROM workspaces WHERE id = ?'),
  getWorkspacesByRepo: db.prepare('SELECT * FROM workspaces WHERE repo_id = ? ORDER BY created_at DESC'),
  getAllWorkspaces: db.prepare('SELECT w.*, r.name as repo_name, r.local_path as repo_path FROM workspaces w JOIN repos r ON w.repo_id = r.id ORDER BY w.created_at DESC'),
  updateWorkspaceStatus: db.prepare('UPDATE workspaces SET status = ? WHERE id = ?'),
  deleteWorkspace: db.prepare('DELETE FROM workspaces WHERE id = ?'),

  // Agent runs
  insertRun: db.prepare(`INSERT INTO agent_runs (id, workspace_id, model, task, status, started_at) VALUES (?, ?, ?, ?, 'running', datetime('now'))`),
  getRun: db.prepare('SELECT * FROM agent_runs WHERE id = ?'),
  getRunsByWorkspace: db.prepare('SELECT * FROM agent_runs WHERE workspace_id = ? ORDER BY started_at DESC'),
  getActiveRuns: db.prepare(`SELECT ar.*, w.name as workspace_name, w.branch, r.name as repo_name FROM agent_runs ar JOIN workspaces w ON ar.workspace_id = w.id JOIN repos r ON w.repo_id = r.id WHERE ar.status = 'running'`),
  updateRunStatus: db.prepare(`UPDATE agent_runs SET status = ?, completed_at = datetime('now'), exit_code = ? WHERE id = ?`),
  updateRunPid: db.prepare('UPDATE agent_runs SET pid = ? WHERE id = ?'),
  updateRunTokens: db.prepare('UPDATE agent_runs SET input_tokens = ?, output_tokens = ?, cost_estimate = ? WHERE id = ?'),

  // Tasks
  insertTask: db.prepare('INSERT INTO tasks (id, workspace_id, text) VALUES (?, ?, ?)'),
  getTasksByWorkspace: db.prepare('SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at'),
  completeTask: db.prepare('UPDATE tasks SET completed = 1 WHERE id = ?'),
  deleteTask: db.prepare('DELETE FROM tasks WHERE id = ?'),

  // Agent output
  insertOutput: db.prepare('INSERT INTO agent_output (run_id, stream, content, metadata) VALUES (?, ?, ?, ?)'),
  getOutputByRun: db.prepare('SELECT * FROM agent_output WHERE run_id = ? ORDER BY id'),
  getRecentOutput: db.prepare('SELECT * FROM agent_output WHERE run_id = ? ORDER BY id DESC LIMIT ?'),

  // Reviews
  insertReview: db.prepare('INSERT INTO reviews (id, workspace_id, diff_summary, files_changed, insertions, deletions) VALUES (?, ?, ?, ?, ?, ?)'),
  getReview: db.prepare('SELECT * FROM reviews WHERE id = ?'),
  getReviewByWorkspace: db.prepare('SELECT * FROM reviews WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1'),
  updateReviewStatus: db.prepare(`UPDATE reviews SET status = ?, merged_at = CASE WHEN ? = 'merged' THEN datetime('now') ELSE merged_at END WHERE id = ?`),

  // Dashboard
  getDashboard: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM agent_runs WHERE status = 'running') as running,
      (SELECT COUNT(*) FROM agent_runs WHERE status = 'completed') as completed,
      (SELECT COUNT(*) FROM agent_runs WHERE status = 'failed') as failed,
      (SELECT COALESCE(SUM(cost_estimate), 0) FROM agent_runs) as total_cost,
      (SELECT COALESCE(SUM(input_tokens), 0) FROM agent_runs) as total_input_tokens,
      (SELECT COALESCE(SUM(output_tokens), 0) FROM agent_runs) as total_output_tokens
  `),

  // Cost by model
  getCostByModel: db.prepare(`
    SELECT model,
      COUNT(*) as runs,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(cost_estimate), 0) as cost
    FROM agent_runs GROUP BY model
  `),
};

module.exports = { db, stmts, DATA_DIR, DB_PATH };
