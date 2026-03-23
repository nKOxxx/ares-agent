#!/usr/bin/env node
// ============================================================================
// ARES Agent Backend - Git operations, Agent spawning, Task management
// ============================================================================

const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// Config
const HOME = process.env.HOME || '/Users/ares';
const AGENT_DIR = path.join(HOME, 'Library/Application Support/ares-agent');
const STATE_FILE = path.join(AGENT_DIR, 'state.json');
const AGENTS_BASE = path.join(AGENT_DIR, 'agents');

// Ensure directories
[AGENT_DIR, AGENTS_BASE].forEach(d => fs.mkdirSync(d, { recursive: true }));

// State
let state = { repos: [], workspaces: [], agents: {} };

// Load state
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (e) { console.error('[state] Load failed:', e.message); }
}

// Save state
function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) { console.error('[state] Save failed:', e.message); }
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

const git = {
    // Clone repository
    clone(repoUrl, localPath) {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(localPath)) {
                console.log(`[git] Already exists: ${localPath}`);
                resolve(localPath);
                return;
            }
            console.log(`[git] Cloning ${repoUrl} → ${localPath}`);
            const child = spawn('git', ['clone', '--recursive', repoUrl, localPath], { stdio: 'inherit' });
            child.on('close', code => {
                if (code === 0) resolve(localPath);
                else reject(new Error(`git clone failed: ${code}`));
            });
        });
    },

    // Create worktree
    worktree(repoPath, wsName) {
        const wsPath = path.join(AGENTS_BASE, wsName);
        if (fs.existsSync(path.join(wsPath, '.git'))) {
            console.log(`[git] Worktree exists: ${wsPath}`);
            return Promise.resolve(wsPath);
        }
        return new Promise((resolve, reject) => {
            console.log(`[git] Creating worktree: ${wsName} at ${wsPath}`);
            const branch = `agent/${wsName}`;
            const child = spawn('git', ['worktree', 'add', '-b', branch, wsPath], { 
                cwd: repoPath,
                stdio: 'inherit' 
            });
            child.on('close', code => {
                if (code === 0) resolve(wsPath);
                else reject(new Error(`git worktree failed: ${code}`));
            });
        });
    },

    // Get status of worktree
    status(wsPath) {
        try {
            const out = execSync('git status --porcelain', { cwd: wsPath, encoding: 'utf8' });
            return out.trim().split('\n').filter(Boolean).map(line => ({
                status: line.slice(0, 2).trim(),
                path: line.slice(3)
            }));
        } catch (e) { return []; }
    },

    // List branches
    branches(repoPath) {
        try {
            const out = execSync('git branch -a', { cwd: repoPath, encoding: 'utf8' });
            return out.trim().split('\n').map(b => b.trim().replace(/^\* /, ''));
        } catch (e) { return ['main']; }
    },

    // Remove worktree
    removeWorktree(repoPath, wsName) {
        const wsPath = path.join(AGENTS_BASE, wsName);
        try {
            console.log(`[git] Removing worktree: ${wsPath}`);
            execSync(`git worktree remove "${wsPath}" --force`, { stdio: 'inherit' });
        } catch (e) { /* may not exist */ }
    }
};

// ============================================================================
// AGENT OPERATIONS
// ============================================================================

const agents = new Map(); // wsId -> { pid, proc, output, task }

const agentOps = {
    // Spawn agent in workspace
    spawn(ws, task) {
        if (agents.has(ws.id)) {
            return { error: 'Agent already running in this workspace' };
        }
        
        console.log(`[agent] Spawning in ${ws.name} task: ${task}`);
        
        ws.status = 'running';
        ws.tasks = ws.tasks || [];
        const taskObj = { id: Date.now().toString(), text: task, completed: false, created: new Date().toISOString() };
        ws.tasks.push(taskObj);
        saveState();
        broadcast({ type: 'task_added', wsId: ws.id, task: taskObj });
        
        // Spawn process - runs OpenClaw agent in workspace
        const worktreePath = ws.path || path.join(AGENTS_BASE, ws.name);
        const env = { ...process.env, TASK: task, WORKSPACE_ID: ws.id };
        
        // For now, simulate agent work with a simple shell script
        // In production, this would spawn OpenClaw: openclaw sessions spawn --task "..." --cwd <path>
        const cmd = `echo "Agent started: ${task}"; sleep 2; echo "Working on: ${task}"; sleep 2; echo "Completed task: ${task}"`;
        const proc = spawn('sh', ['-c', cmd], { cwd: worktreePath, env });
        
        const agentData = { pid: proc.pid, proc, output: '', task };
        agents.set(ws.id, agentData);
        
        proc.stdout.on('data', d => {
            agentData.output += d.toString();
            broadcast({ type: 'output', wsId: ws.id, line: d.toString() });
        });
        
        proc.stderr.on('data', d => {
            agentData.output += d.toString();
            broadcast({ type: 'output', wsId: ws.id, line: d.toString() });
        });
        
        proc.on('close', code => {
            ws.status = code === 0 ? 'completed' : 'failed';
            saveState();
            broadcast({ type: 'agent_complete', wsId: ws.id, code });
            agents.delete(ws.id);
        });
        
        return { success: true, taskId: taskObj.id };
    },
    
    // Kill agent
    kill(wsId) {
        const agent = agents.get(wsId);
        if (agent) {
            try { process.kill(agent.pid); } catch(e) {}
            agents.delete(wsId);
        }
        const ws = state.workspaces.find(w => w.id === wsId);
        if (ws) {
            ws.status = 'stopped';
            saveState();
        }
        broadcast({ type: 'agent_killed', wsId });
        return { success: true };
    },
    
    // Get output
    output(wsId) {
        const agent = agents.get(wsId);
        return agent ? agent.output : '';
    }
};

// ============================================================================
// REAL-TIME UPDATES (SSE)
// ============================================================================

const clients = new Set();

function broadcast(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        try { res.write(msg); } catch(e) { clients.delete(res); }
    }
}

// ============================================================================
// HTTP SERVER
// ============================================================================

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    
    // SSE endpoint
    if (pathname === '/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
    }
    
    // Parse body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        let data = {};
        try { data = body ? JSON.parse(body) : {}; } catch(e) {}
        
        // ====================================================================
        // REPOS
        // ====================================================================
        if (pathname === '/api/repos' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.repos));
            return;
        }
        
        if (pathname === '/api/repos' && req.method === 'POST') {
            const { url: repoUrl, path: localPath } = data;
            if (!repoUrl) { res.writeHead(400); res.end('{"error":"url required"}'); return; }
            
            const name = repoUrl.split('/').pop().replace('.git', '');
            const repoPath = localPath || path.join(HOME, 'Projects', name);
            const repo = { id: Date.now().toString(), name, url: repoUrl, path: repoPath };
            state.repos.push(repo);
            saveState();
            
            // Async clone
            git.clone(repoUrl, repoPath).catch(e => console.error('[clone]', e.message));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(repo));
            return;
        }
        
        if (pathname.startsWith('/api/repos/') && req.method === 'DELETE') {
            const id = pathname.slice('/api/repos/'.length);
            state.repos = state.repos.filter(r => r.id !== id);
            saveState();
            res.writeHead(200); res.end('{}');
            return;
        }
        
        // ====================================================================
        // WORKSPACES
        // ====================================================================
        if (pathname === '/api/workspaces' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.workspaces));
            return;
        }
        
        if (pathname === '/api/workspaces' && req.method === 'POST') {
            const { repoId, name, branch } = data;
            const repo = state.repos.find(r => r.id === repoId);
            if (!repo) { res.writeHead(404); res.end('{"error":"repo not found"}'); return; }
            
            const ws = {
                id: Date.now().toString(),
                repoId,
                name,
                branch: branch || `agent/${name}`,
                path: path.join(AGENTS_BASE, name),
                status: 'idle',
                tasks: [],
                files: [],
                created: new Date().toISOString()
            };
            state.workspaces.push(ws);
            saveState();
            
            // Async create worktree
            git.worktree(repo.path, name).then(wsPath => {
                ws.path = wsPath;
                saveState();
            }).catch(e => console.error('[worktree]', e.message));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ws));
            return;
        }
        
        if (pathname.startsWith('/api/workspaces/') && req.method === 'DELETE') {
            const wsId = pathname.slice('/api/workspaces/'.length);
            const ws = state.workspaces.find(w => w.id === wsId);
            if (ws) {
                const repo = state.repos.find(r => r.id === ws.repoId);
                if (repo) git.removeWorktree(repo.path, ws.name);
                agentOps.kill(wsId);
                state.workspaces = state.workspaces.filter(w => w.id !== wsId);
                saveState();
            }
            res.writeHead(200); res.end('{}');
            return;
        }
        
        // ====================================================================
        // WORKSPACE ACTIONS
        // ====================================================================
        if (pathname.startsWith('/api/workspaces/') && req.method === 'POST') {
            const wsId = pathname.slice('/api/workspaces/'.length);
            const ws = state.workspaces.find(w => w.id === wsId);
            if (!ws) { res.writeHead(404); res.end('{"error":"workspace not found"}'); return; }
            
            const { action, task, taskId, text } = data;
            
            if (action === 'spawn') {
                const result = agentOps.spawn(ws, task || 'Default task');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }
            
            if (action === 'kill') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(agentOps.kill(wsId)));
                return;
            }
            
            if (action === 'status') {
                ws.files = git.status(ws.path);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: ws.status,
                    output: agentOps.output(wsId),
                    files: ws.files,
                    tasks: ws.tasks || [],
                    isRunning: agents.has(wsId)
                }));
                return;
            }
            
            if (action === 'add_task') {
                ws.tasks = ws.tasks || [];
                const taskObj = { id: Date.now().toString(), text, completed: false, created: new Date().toISOString() };
                ws.tasks.push(taskObj);
                saveState();
                broadcast({ type: 'task_added', wsId, task: taskObj });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(taskObj));
                return;
            }
            
            if (action === 'complete_task') {
                const task = ws.tasks?.find(t => t.id === taskId);
                if (task) { task.completed = true; saveState(); broadcast({ type: 'task_completed', wsId, taskId }); }
                res.writeHead(200); res.end('{}');
                return;
            }
            
            if (action === 'delete_task') {
                ws.tasks = (ws.tasks || []).filter(t => t.id !== taskId);
                saveState();
                res.writeHead(200); res.end('{}');
                return;
            }
        }
        
        // Default: 404
        res.writeHead(404);
        res.end('{"error":"not found"}');
    });
});

// ============================================================================
// STARTUP
// ============================================================================

loadState();

server.listen(8765, () => {
    console.log('[ARES] Backend running on http://localhost:8765');
    console.log('[ARES] State file:', STATE_FILE);
    console.log('[ARES] Agents dir:', AGENTS_BASE);
});

process.on('SIGINT', () => {
    console.log('[ARES] Shutting down...');
    for (const [id] of agents) agentOps.kill(id);
    saveState();
    process.exit(0);
});
