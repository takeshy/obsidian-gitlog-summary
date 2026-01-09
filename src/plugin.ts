import { Plugin, Editor, PluginSettingTab, App, Setting, Notice, Modal, TextComponent } from 'obsidian';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as Handlebars from 'handlebars';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// WSL UNCパスの情報を解析
function parseWslPath(dir: string): { isWsl: boolean; distro?: string; wslPath?: string } {
  const wslMatch = dir.match(/^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\(.+)$/i);
  if (wslMatch) {
    return {
      isWsl: true,
      distro: wslMatch[1],
      wslPath: '/' + wslMatch[2].replace(/\\/g, '/'),
    };
  }
  return { isWsl: false };
}

// gitコマンドを実行
async function runGitCommand(dir: string, gitCommand: string): Promise<string> {
  const wslInfo = parseWslPath(dir);
  if (wslInfo.isWsl) {
    // WSLの場合はexecFileで直接wslを呼び出す（シェルを通さない）
    const bashCmd = `cd "${wslInfo.wslPath}" && ${gitCommand}`;
    const { stdout } = await execFileAsync('wsl', ['-d', wslInfo.distro!, '--', 'bash', '-c', bashCmd]);
    return stdout;
  }
  // 通常のパス
  const cmd = `cd "${dir}" && ${gitCommand}`;
  const { stdout } = await execAsync(cmd);
  return stdout;
}

// パスからリポジトリ名を取得（WSLパスとUnixパス両対応）
function getRepoName(dir: string): string {
  // バックスラッシュとスラッシュの両方で分割
  const parts = dir.split(/[/\\]/).filter(p => p);
  return parts[parts.length - 1] || dir;
}

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
{{#if branches}}
### Branches
{{#each branches~}}
- {{name}}{{#if isPushed}} (pushed){{else}} (unpushed{{#if (ne unpushedCount -1)}}: {{unpushedCount}}{{/if}}){{/if}}
{{/each}}
{{/if~}}
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
        const output = await this.getGitLogs();
        if (!output.trim()) {
          new Notice('No commits found for today');
          return;
        }
        // ノートの最後に追記
        const lastLine = editor.lastLine();
        const lastLineLength = editor.getLine(lastLine).length;
        editor.setCursor({ line: lastLine, ch: lastLineLength });
        editor.replaceSelection('\n' + output);
      },
    });

    this.addCommand({
      id: 'insert-gitlog-for-date',
      name: 'Insert Git log for date',
      editorCallback: (editor: Editor) => {
        new DateInputModal(this.app, async (dateStr: string) => {
          const output = await this.getGitLogs(dateStr);
          if (!output.trim()) {
            new Notice(`No commits found for ${dateStr}`);
            return;
          }
          // ノートの最後に追記
          const lastLine = editor.lastLine();
          const lastLineLength = editor.getLine(lastLine).length;
          editor.setCursor({ line: lastLine, ch: lastLineLength });
          editor.replaceSelection('\n' + output);
        }).open();
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

  async getGitLogs(dateStr?: string): Promise<string> {
    if (!dateStr) {
      const today = new Date();
      dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    const allLogs: { time: string; message: string; repo: string; branch: string }[] = [];
    const stagedChanges: { repo: string; file: string }[] = [];
    const unstagedChanges: { repo: string; file: string }[] = [];
    const branchStatuses: { repo: string; name: string; isPushed: boolean; unpushedCount: number }[] = [];

    for (const dir of this.settings.directories) {
      if (!dir.trim()) continue;

      const repoName = getRepoName(dir);

      try {
        // git reflogで今日更新があったブランチを取得
        const branches = new Set<string>();
        try {
          const reflogGitCmd = `git reflog --all --since="${dateStr} 00:00" --format="%gD"`;
          const reflogOutput = await runGitCommand(dir, reflogGitCmd);

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
            const branchGitCmd = 'git rev-parse --abbrev-ref HEAD';
            const currentBranch = await runGitCommand(dir, branchGitCmd);
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
            const logGitCmd = `git log "${branch}" --since="${dateStr} 00:00" --until="${dateStr} 23:59" ${authorFilter} --pretty=format:"%H|%ad|%s" --date=format:"%H:%M"`;
            const logOutput = await runGitCommand(dir, logGitCmd);

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

        // 各ブランチのpush状態を確認
        for (const branch of branches) {
          try {
            // リモートブランチとの差分を確認
            const unpushedGitCmd = `git log origin/${branch}..${branch} --oneline 2>/dev/null | wc -l`;
            const unpushedOutput = await runGitCommand(dir, unpushedGitCmd);
            const unpushedCount = parseInt(unpushedOutput.trim(), 10) || 0;
            branchStatuses.push({
              repo: repoName,
              name: branch,
              isPushed: unpushedCount === 0,
              unpushedCount,
            });
          } catch {
            // リモートブランチが存在しない場合は未push扱い
            branchStatuses.push({
              repo: repoName,
              name: branch,
              isPushed: false,
              unpushedCount: -1, // リモートなし
            });
          }
        }

        // Staged (addされているがコミットされていない)
        const stagedOutput = await runGitCommand(dir, 'git diff --cached --name-only');

        if (stagedOutput.trim()) {
          for (const file of stagedOutput.trim().split('\n')) {
            stagedChanges.push({ repo: repoName, file });
          }
        }

        // Unstaged (addもされていない変更)
        const unstagedOutput = await runGitCommand(dir, 'git diff --name-only');

        if (unstagedOutput.trim()) {
          for (const file of unstagedOutput.trim().split('\n')) {
            unstagedChanges.push({ repo: repoName, file });
          }
        }

        // Untracked (新規ファイル)
        const untrackedOutput = await runGitCommand(dir, 'git ls-files --others --exclude-standard');

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
      .map(dir => getRepoName(dir));

    // Group by repository
    const repositories = repoNames.map(name => ({
      name,
      commits: allLogs.filter(c => c.repo === name),
      staged: stagedChanges.filter(s => s.repo === name),
      unstaged: unstagedChanges.filter(u => u.repo === name),
      branches: branchStatuses.filter(b => b.repo === name),
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

class DateInputModal extends Modal {
  private onSubmit: (date: string) => void;
  private dateInput!: TextComponent;

  constructor(app: App, onSubmit: (date: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Enter date' });

    const today = new Date();
    const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    new Setting(contentEl)
      .setName('Date')
      .setDesc('Format: YYYY-MM-DD')
      .addText(text => {
        this.dateInput = text;
        text.setPlaceholder('YYYY-MM-DD')
          .setValue(defaultDate);
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.submit();
          }
        });
      });

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Insert')
        .setCta()
        .onClick(() => this.submit()));
  }

  private submit() {
    const value = this.dateInput.getValue();
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.close();
      this.onSubmit(value);
    } else {
      new Notice('Invalid date format. Use YYYY-MM-DD');
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
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
        <li><code>{{#each repositories}}...{{/each}}</code> - Loop over repositories (each has <code>name</code>, <code>commits</code>, <code>staged</code>, <code>unstaged</code>, <code>branches</code>)</li>
        <li><code>{{#if (or commits staged unstaged)}}...{{/if}}</code> - Show if any items exist</li>
        <li><code>{{#some commits messageStartsWith="fix"}}...{{/some}}</code> - Check if any item matches</li>
        <li><code>{{#eq name "my-repo"}}...{{/eq}}</code> - Equal comparison</li>
        <li><code>{{#startsWith message "fix"}}...{{/startsWith}}</code> - Check if starts with</li>
        <li>Commit: <code>{{time}}</code>, <code>{{message}}</code>, <code>{{branch}}</code></li>
        <li>Branch: <code>{{name}}</code>, <code>{{isPushed}}</code>, <code>{{unpushedCount}}</code></li>
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
