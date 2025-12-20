import { Plugin, Editor, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface GitLogSettings {
  directories: string[];
  authorEmail: string;
}

const DEFAULT_SETTINGS: GitLogSettings = {
  directories: [],
  authorEmail: '',
};

export class GitLogSummaryPlugin extends Plugin {
  settings!: GitLogSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'insert-today-gitlog',
      name: "Insert today's Git log",
      editorCallback: async (editor: Editor) => {
        const logs = await this.getTodayGitLogs();
        if (logs.length === 0) {
          new Notice('No commits found for today');
          return;
        }
        editor.replaceSelection(logs.join('\n') + '\n');
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

  async getTodayGitLogs(): Promise<string[]> {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const allLogs: { time: string; message: string; repo: string }[] = [];
    const stagedChanges: { repo: string; files: string[] }[] = [];
    const unstagedChanges: { repo: string; files: string[] }[] = [];

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
          stagedChanges.push({
            repo: repoName,
            files: stagedOutput.trim().split('\n'),
          });
        }

        // Unstaged (addもされていない変更)
        const unstagedCmd = `cd "${dir}" && git diff --name-only`;
        const { stdout: unstagedOutput } = await execAsync(unstagedCmd);
        
        if (unstagedOutput.trim()) {
          unstagedChanges.push({
            repo: repoName,
            files: unstagedOutput.trim().split('\n'),
          });
        }

        // Untracked (新規ファイル)
        const untrackedCmd = `cd "${dir}" && git ls-files --others --exclude-standard`;
        const { stdout: untrackedOutput } = await execAsync(untrackedCmd);
        
        if (untrackedOutput.trim()) {
          const existing = unstagedChanges.find(u => u.repo === repoName);
          const untrackedFiles = untrackedOutput.trim().split('\n').map(f => `${f} (new)`);
          if (existing) {
            existing.files.push(...untrackedFiles);
          } else {
            unstagedChanges.push({
              repo: repoName,
              files: untrackedFiles,
            });
          }
        }

      } catch (e) {
        console.error(`Failed to get git status from ${dir}:`, e);
      }
    }

    const result: string[] = [];

    // コミット済み
    if (allLogs.length > 0) {
      result.push('### Commits');
      allLogs.sort((a, b) => a.time.localeCompare(b.time));
      for (const log of allLogs) {
        result.push(`- ${log.time} [${log.repo}] ${log.message}`);
      }
    }

    // Staged
    if (stagedChanges.length > 0) {
      result.push('');
      result.push('### Staged');
      for (const change of stagedChanges) {
        for (const file of change.files) {
          result.push(`- [${change.repo}] ${file}`);
        }
      }
    }

    // Unstaged
    if (unstagedChanges.length > 0) {
      result.push('');
      result.push('### Unstaged');
      for (const change of unstagedChanges) {
        for (const file of change.files) {
          result.push(`- [${change.repo}] ${file}`);
        }
      }
    }

    // 実行時間とセパレーター
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    result.push('');
    result.push(`(${timestamp})`);
    result.push('');
    result.push('---');
    result.push('');

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

    const textArea = containerEl.createEl('textarea', {
      cls: 'gitlog-directories-textarea',
    });
    textArea.style.width = '100%';
    textArea.style.height = '200px';
    textArea.style.fontFamily = 'monospace';
    textArea.value = this.plugin.settings.directories.join('\n');
    textArea.addEventListener('change', async () => {
      this.plugin.settings.directories = textArea.value
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      await this.plugin.saveSettings();
    });
  }
}
