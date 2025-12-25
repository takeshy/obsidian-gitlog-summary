import { Plugin, Editor, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as Handlebars from 'handlebars';

const execAsync = promisify(exec);

// Register custom helpers
Handlebars.registerHelper('eq', function(this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('ne', function(this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a !== b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('contains', function(this: unknown, str: unknown, substr: string, options: Handlebars.HelperOptions) {
  return String(str).includes(substr) ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('startsWith', function(this: unknown, str: unknown, prefix: string, options: Handlebars.HelperOptions) {
  return String(str).startsWith(prefix) ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('array', function(...args: unknown[]) {
  // Remove the last argument (Handlebars options object)
  return args.slice(0, -1);
});

Handlebars.registerHelper('or', function(...args: unknown[]) {
  // Remove the last argument (Handlebars options object)
  const values = args.slice(0, -1);
  return values.some(v => Array.isArray(v) ? v.length > 0 : Boolean(v));
});

Handlebars.registerHelper('some', function(this: unknown, array: unknown[], options: Handlebars.HelperOptions) {
  if (!Array.isArray(array)) return options.inverse(this);
  const hash = options.hash as Record<string, string>;
  const hasMatch = array.some(item => {
    const record = item as Record<string, string>;
    for (const [key, value] of Object.entries(hash)) {
      // Support "fieldStartsWith" syntax (e.g., messageStartsWith="fix")
      if (key.endsWith('StartsWith')) {
        const field = key.replace('StartsWith', '').toLowerCase();
        if (!String(record[field] || '').startsWith(value)) return false;
      } else if (key.endsWith('NotStartsWithAny')) {
        // Support comma-separated prefixes: messageNotStartsWithAny="fix,design"
        const field = key.replace('NotStartsWithAny', '').toLowerCase();
        const prefixes = value.split(',');
        const fieldValue = String(record[field] || '');
        if (prefixes.some(prefix => fieldValue.startsWith(prefix))) return false;
      } else {
        if (record[key] !== value) return false;
      }
    }
    return true;
  });
  return hasMatch ? options.fn(this) : options.inverse(this);
});

interface GitLogSettings {
  directories: string[];
  authorEmail: string;
  outputTemplate: string;
}

const DEFAULT_TEMPLATE = `{{#each repositories~}}
{{#if (or commits staged unstaged)}}
## {{name}}
{{#if commits}}
### Commits
{{#each commits~}}
- {{time}} [{{branch}}] {{message}}
{{/each}}
{{/if~}}
{{#if staged}}
### Staged
{{#each staged~}}
- {{file}}
{{/each}}
{{/if~}}
{{#if unstaged}}
### Unstaged
{{#each unstaged~}}
- {{file}}
{{/each}}
{{/if}}
{{/if~}}
{{/each}}
({{timestamp}})

---
`;

const DEFAULT_SETTINGS: GitLogSettings = {
  directories: [],
  authorEmail: '',
  outputTemplate: DEFAULT_TEMPLATE,
};

export class GitLogSummaryPlugin extends Plugin {
  settings!: GitLogSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'insert-today-gitlog',
      name: "Insert today's Git log",
      editorCallback: async (editor: Editor) => {
        const output = await this.getTodayGitLogs();
        if (!output.trim()) {
          new Notice('No commits found for today');
          return;
        }
        editor.replaceSelection(output);
      },
    });

    this.addSettingTab(new GitLogSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async getTodayGitLogs(): Promise<string> {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const allLogs: { time: string; message: string; repo: string; branch: string }[] = [];
    const stagedChanges: { repo: string; file: string }[] = [];
    const unstagedChanges: { repo: string; file: string }[] = [];

    for (const dir of this.settings.directories) {
      if (!dir.trim()) continue;

      const repoName = dir.split('/').pop() || dir;

      try {
        // git reflogで今日更新があったブランチを取得
        const branches = new Set<string>();
        try {
          const reflogCmd = `cd "${dir}" && git reflog --all --since="${dateStr} 00:00" --format="%gD"`;
          const { stdout: reflogOutput } = await execAsync(reflogCmd);

          if (reflogOutput.trim()) {
            for (const line of reflogOutput.trim().split('\n')) {
              // refs/heads/branch-name@{N} -> branch-name
              const match = line.match(/refs\/heads\/([^@]+)@/);
              if (match) {
                branches.add(match[1]);
              }
            }
          }
        } catch {
          // reflogが失敗した場合は無視
        }

        // ブランチが見つからない場合は現在のブランチを使用
        if (branches.size === 0) {
          try {
            const { stdout: currentBranch } = await execAsync(`cd "${dir}" && git rev-parse --abbrev-ref HEAD`);
            branches.add(currentBranch.trim());
          } catch {
            // 現在のブランチも取得できない場合はスキップ
            continue;
          }
        }

        // コミット済みのログ（各ブランチから取得、ハッシュで重複除去）
        const authorFilter = this.settings.authorEmail
          ? `--author="${this.settings.authorEmail}"`
          : '';

        const seenHashes = new Set<string>();

        for (const branch of branches) {
          try {
            const logCmd = `cd "${dir}" && git log "${branch}" --since="${dateStr} 00:00" --until="${dateStr} 23:59" ${authorFilter} --pretty=format:"%H|%ad|%s" --date=format:"%H:%M"`;
            const { stdout: logOutput } = await execAsync(logCmd);

            if (logOutput.trim()) {
              const lines = logOutput.trim().split('\n');

              for (const line of lines) {
                const [hash, time, ...messageParts] = line.split('|');
                if (seenHashes.has(hash)) continue;
                seenHashes.add(hash);

                const message = messageParts.join('|');
                allLogs.push({ time, message, repo: repoName, branch });
              }
            }
          } catch {
            // ブランチのログ取得に失敗した場合は無視
          }
        }

        // Staged (addされているがコミットされていない)
        const stagedCmd = `cd "${dir}" && git diff --cached --name-only`;
        const { stdout: stagedOutput } = await execAsync(stagedCmd);

        if (stagedOutput.trim()) {
          for (const file of stagedOutput.trim().split('\n')) {
            stagedChanges.push({ repo: repoName, file });
          }
        }

        // Unstaged (addもされていない変更)
        const unstagedCmd = `cd "${dir}" && git diff --name-only`;
        const { stdout: unstagedOutput } = await execAsync(unstagedCmd);

        if (unstagedOutput.trim()) {
          for (const file of unstagedOutput.trim().split('\n')) {
            unstagedChanges.push({ repo: repoName, file });
          }
        }

        // Untracked (新規ファイル)
        const untrackedCmd = `cd "${dir}" && git ls-files --others --exclude-standard`;
        const { stdout: untrackedOutput } = await execAsync(untrackedCmd);

        if (untrackedOutput.trim()) {
          for (const file of untrackedOutput.trim().split('\n')) {
            unstagedChanges.push({ repo: repoName, file: `${file} (new)` });
          }
        }

      } catch (e) {
        console.error(`Failed to get git status from ${dir}:`, e);
      }
    }

    // Sort commits by time
    allLogs.sort((a, b) => a.time.localeCompare(b.time));

    // Get repository names from settings
    const repoNames = this.settings.directories
      .filter(dir => dir.trim())
      .map(dir => dir.split('/').pop() || dir);

    // Group by repository
    const repositories = repoNames.map(name => ({
      name,
      commits: allLogs.filter(c => c.repo === name),
      staged: stagedChanges.filter(s => s.repo === name),
      unstaged: unstagedChanges.filter(u => u.repo === name),
    }));

    // Generate timestamp
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Render template with Handlebars
    try {
      const template = Handlebars.compile(this.settings.outputTemplate);
      return template({
        commits: allLogs,
        staged: stagedChanges,
        unstaged: unstagedChanges,
        repositories,
        timestamp,
      });
    } catch (e) {
      console.error('Template error:', e);
      new Notice('Template error: ' + (e as Error).message);
      return '';
    }
  }
}

class GitLogSettingTab extends PluginSettingTab {
  plugin: GitLogSummaryPlugin;

  constructor(app: App, plugin: GitLogSummaryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Git log summary settings' });

    new Setting(containerEl)
      .setName('Author email')
      .setDesc('Filter commits by author email (optional)')
      .addText(text => text
        .setPlaceholder('Enter your email')
        .setValue(this.plugin.settings.authorEmail)
        .onChange(async (value) => {
          this.plugin.settings.authorEmail = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Git directories')
      .setDesc('One directory path per line. Full path required (e.g., /home/user/project)');

    const dirTextArea = containerEl.createEl('textarea', {
      cls: 'gitlog-directories-textarea',
    });
    dirTextArea.style.width = '100%';
    dirTextArea.style.height = '150px';
    dirTextArea.style.fontFamily = 'monospace';
    dirTextArea.value = this.plugin.settings.directories.join('\n');
    dirTextArea.addEventListener('change', async () => {
      this.plugin.settings.directories = dirTextArea.value
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      await this.plugin.saveSettings();
    });

    // 出力フォーマット設定
    containerEl.createEl('h3', { text: 'Output format' });

    const formatDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
    formatDesc.innerHTML = `
      <p>Uses <a href="https://handlebarsjs.com/guide/" target="_blank">Handlebars</a> template syntax:</p>
      <ul>
        <li><code>{{#each repositories}}...{{/each}}</code> - Loop over repositories (each has <code>name</code>, <code>commits</code>, <code>staged</code>, <code>unstaged</code>)</li>
        <li><code>{{#if (or commits staged unstaged)}}...{{/if}}</code> - Show if any items exist</li>
        <li><code>{{#some commits messageStartsWith="fix"}}...{{/some}}</code> - Check if any item matches</li>
        <li><code>{{#eq name "my-repo"}}...{{/eq}}</code> - Equal comparison</li>
        <li><code>{{#startsWith message "fix"}}...{{/startsWith}}</code> - Check if starts with</li>
        <li>Commit: <code>{{time}}</code>, <code>{{message}}</code>, <code>{{branch}}</code></li>
        <li>File: <code>{{file}}</code></li>
        <li><code>{{timestamp}}</code> - Current date/time</li>
      </ul>
    `;
    formatDesc.style.marginBottom = '10px';
    formatDesc.style.fontSize = '0.9em';

    const templateTextArea = containerEl.createEl('textarea', {
      cls: 'gitlog-template-textarea',
    });
    templateTextArea.style.width = '100%';
    templateTextArea.style.height = '300px';
    templateTextArea.style.fontFamily = 'monospace';
    templateTextArea.value = this.plugin.settings.outputTemplate;
    templateTextArea.addEventListener('change', async () => {
      this.plugin.settings.outputTemplate = templateTextArea.value;
      await this.plugin.saveSettings();
    });

    // Reset button
    new Setting(containerEl)
      .setName('Reset template')
      .setDesc('Restore the default output template')
      .addButton(button => button
        .setButtonText('Reset')
        .onClick(async () => {
          this.plugin.settings.outputTemplate = DEFAULT_TEMPLATE;
          templateTextArea.value = DEFAULT_TEMPLATE;
          await this.plugin.saveSettings();
        }));
  }
}
