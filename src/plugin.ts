import { Plugin, Editor, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface GitLogSettings {
  directories: string[];
  authorEmail: string;
  outputTemplate: string;
}

const DEFAULT_TEMPLATE = `{{#commits}}
### Commits
{{#each}}
- {{time}} [{{repo}}] {{message}}
{{/each}}
{{/commits}}

{{#staged}}
### Staged
{{#each}}
- [{{repo}}] {{file}}
{{/each}}
{{/staged}}

{{#unstaged}}
### Unstaged
{{#each}}
- [{{repo}}] {{file}}
{{/each}}
{{/unstaged}}

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

    const allLogs: { time: string; message: string; repo: string }[] = [];
    const stagedChanges: { repo: string; file: string }[] = [];
    const unstagedChanges: { repo: string; file: string }[] = [];

    for (const dir of this.settings.directories) {
      if (!dir.trim()) continue;

      const repoName = dir.split('/').pop() || dir;

      try {
        // コミット済みのログ
        const authorFilter = this.settings.authorEmail
          ? `--author="${this.settings.authorEmail}"`
          : '';

        const logCmd = `cd "${dir}" && git log --since="${dateStr} 00:00" --until="${dateStr} 23:59" ${authorFilter} --pretty=format:"%H|%ad|%s" --date=format:"%H:%M"`;

        const { stdout: logOutput } = await execAsync(logCmd);

        if (logOutput.trim()) {
          const lines = logOutput.trim().split('\n');

          for (const line of lines) {
            const [_hash, time, ...messageParts] = line.split('|');
            const message = messageParts.join('|');
            allLogs.push({ time, message, repo: repoName });
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

    // Generate timestamp
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Render template
    return this.renderTemplate(this.settings.outputTemplate, {
      commits: allLogs,
      staged: stagedChanges,
      unstaged: unstagedChanges,
      timestamp,
    });
  }

  renderTemplate(
    template: string,
    data: {
      commits: { time: string; message: string; repo: string }[];
      staged: { repo: string; file: string }[];
      unstaged: { repo: string; file: string }[];
      timestamp: string;
    }
  ): string {
    let result = template;

    // Process {{#section}}...{{/section}} blocks
    const sections = ['commits', 'staged', 'unstaged'] as const;

    for (const section of sections) {
      const regex = new RegExp(`\\{\\{#${section}\\}\\}([\\s\\S]*?)\\{\\{/${section}\\}\\}`, 'g');
      result = result.replace(regex, (_match, content: string) => {
        const items = data[section];
        if (items.length === 0) return '';

        // Process {{#each}}...{{/each}} within the section
        const eachRegex = /\{\{#each\}\}([\s\S]*?)\{\{\/each\}\}/g;
        const processedContent = content.replace(eachRegex, (_eachMatch: string, itemTemplate: string) => {
          return items.map((item: Record<string, string>) => {
            let line = itemTemplate;
            for (const [key, value] of Object.entries(item)) {
              line = line.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
            }
            return line;
          }).join('');
        });

        return processedContent;
      });
    }

    // Replace {{timestamp}}
    result = result.replace(/\{\{timestamp\}\}/g, data.timestamp);

    return result;
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
      <p>Template syntax:</p>
      <ul>
        <li><code>{{#commits}}...{{/commits}}</code> - Commits section (hidden if empty)</li>
        <li><code>{{#staged}}...{{/staged}}</code> - Staged files section (hidden if empty)</li>
        <li><code>{{#unstaged}}...{{/unstaged}}</code> - Unstaged files section (hidden if empty)</li>
        <li><code>{{#each}}...{{/each}}</code> - Loop over items in section</li>
        <li>Commit variables: <code>{{time}}</code>, <code>{{repo}}</code>, <code>{{message}}</code></li>
        <li>File variables: <code>{{repo}}</code>, <code>{{file}}</code></li>
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
