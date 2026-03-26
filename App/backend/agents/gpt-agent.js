const BaseAgent = require('./base-agent');
const { stmts } = require('../db');
const { getApiKey } = require('../proxy/router');
const fs = require('fs');
const path = require('path');

class GptAgent extends BaseAgent {
  constructor(runId, workspaceId, task, worktreePath, options = {}) {
    super(runId, workspaceId, options.model || 'gpt', task, worktreePath);
    this.gptModel = options.gptModel || 'gpt-4o';
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens || 4096;
    this.systemPrompt = options.systemPrompt || 'You are a research assistant. Provide thorough, well-structured analysis. Output in markdown format.';
  }

  async start() {
    this.status = 'running';
    stmts.updateWorkspaceStatus.run('running', this.workspaceId);

    this._onOutput('system', `Spawning GPT research agent...`);
    this._onOutput('system', `Task: ${this.task}`);
    this._onOutput('system', `Model: ${this.gptModel} | Temp: ${this.temperature}`);

    try {
      const apiKey = getApiKey('gpt');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.gptModel,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: this.task },
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this._onOutput('error', `OpenAI API error: ${response.status} ${err}`);
        this._onComplete('failed', 1);
        return;
      }

      let fullOutput = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              fullOutput += delta.content;
              this._onOutput('text_delta', delta.content);
            }

            // Track usage from final chunk
            if (parsed.usage) {
              this.inputTokens = parsed.usage.prompt_tokens || 0;
              this.outputTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      }

      // Save research output to workspace as markdown
      if (fullOutput && this.worktreePath) {
        const outputDir = path.join(this.worktreePath, '.hermes-research');
        fs.mkdirSync(outputDir, { recursive: true });
        const filename = `research-${Date.now()}.md`;
        fs.writeFileSync(path.join(outputDir, filename), `# Research: ${this.task}\n\n${fullOutput}`);
        this._onOutput('system', `Research saved to .hermes-research/${filename}`);
      }

      this._onOutput('result', fullOutput);
      this._onComplete('completed', 0);

    } catch (err) {
      this._onOutput('error', `GPT agent error: ${err.message}`);
      this._onComplete('failed', 1);
    }
  }

  async stop() {
    // For API-based agents, we can't kill the request easily
    // Just mark as killed
    this.status = 'killed';
    this._onComplete('killed', -1);
  }
}

module.exports = GptAgent;
