# Git Log Summary for Obsidian

An Obsidian plugin that inserts today's git log summary into your notes.

## Screenshots

### Usage
![Usage](image.png)

### Settings
![Settings](settings.png)

## Features

- **Today's commits** - Insert all commits from today across multiple repositories
- **Multiple repositories** - Monitor multiple git directories at once
- **Staged changes** - Shows files that are staged but not yet committed
- **Unstaged changes** - Shows modified and untracked files
- **Author filtering** - Filter commits by author email (optional)
- **Time-sorted output** - Commits are sorted by time

## Output Format

The plugin inserts a formatted summary like this:

```markdown
### Commits
- 09:30 [project-a] Add new feature
- 10:45 [project-b] Fix bug in login

### Staged
- [project-a] src/index.ts

### Unstaged
- [project-b] README.md
- [project-b] config.json (new)
```

## Template Customization

The output format can be customized using [Handlebars](https://handlebarsjs.com/) template syntax in the settings.

### Available Variables

| Context | Variables |
|---------|-----------|
| Commits | `{{time}}`, `{{repo}}`, `{{message}}` |
| Staged/Unstaged | `{{repo}}`, `{{file}}` |
| Global | `{{timestamp}}` |

### Built-in Helpers

- `{{#if commits}}...{{/if}}` - Conditional rendering
- `{{#each commits}}...{{/each}}` - Loop over items
- `{{#unless}}...{{/unless}}` - Negative conditional
- `{{else}}` - Else clause

### Custom Helpers

- `{{#eq value "string"}}...{{else}}...{{/eq}}` - Equal comparison
- `{{#ne value "string"}}...{{/ne}}` - Not equal comparison
- `{{#contains value "substring"}}...{{/contains}}` - String contains check
- `{{#startsWith value "prefix"}}...{{/startsWith}}` - String starts with check
- `(array "a" "b" "c")` - Create inline array for use with `{{#each}}`

### Template Examples

#### Group commits by type and repository

This example groups commits into Bug fixes, Design, and Features, then by repository.

**Prerequisites:**
- Replace `"my-app"` and `"api-server"` with your actual repository directory names
- Commits are categorized by message prefix:
  - `fix` prefix → Bug fixes
  - `design` prefix → Design
  - Other → Features
- Display names (`frontend`, `backend`) can be customized in the `{{#eq}}` blocks

```handlebars
{{#if commits}}
### Bug fixes
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}frontend{{else}}{{#eq this "api-server"}}backend{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../commits}}
{{#eq repo ../this}}
{{#startsWith message "fix"}}
- {{time}} {{message}}
{{/startsWith}}
{{/eq}}
{{/each}}
{{/each}}

### Design
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}frontend{{else}}{{#eq this "api-server"}}backend{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../commits}}
{{#eq repo ../this}}
{{#startsWith message "design"}}
- {{time}} {{message}}
{{/startsWith}}
{{/eq}}
{{/each}}
{{/each}}

### Features
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}frontend{{else}}{{#eq this "api-server"}}backend{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../commits}}
{{#eq repo ../this}}
{{#startsWith message "fix"}}{{else}}{{#startsWith message "design"}}{{else}}
- {{time}} {{message}}
{{/startsWith}}{{/startsWith}}
{{/eq}}
{{/each}}
{{/each}}
{{/if}}

{{#if staged}}
### Staged
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}frontend{{else}}{{#eq this "api-server"}}backend{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../staged}}
{{#eq repo ../this}}
- {{file}}
{{/eq}}
{{/each}}
{{/each}}
{{/if}}

{{#if unstaged}}
### Unstaged
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}frontend{{else}}{{#eq this "api-server"}}backend{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../unstaged}}
{{#eq repo ../this}}
- {{file}}
{{/eq}}
{{/each}}
{{/each}}
{{/if}}

({{timestamp}})
```

Output:
```markdown
### Bug fixes
#### frontend
- 10:30 fix: resolve login issue
- 14:00 fix: handle null pointer

### Design
#### frontend
- 11:00 design: update button styles

### Features
#### frontend
- 09:00 add user profile page
#### backend
- 12:00 add health check endpoint

### Staged
#### frontend
- src/components/Button.tsx

### Unstaged
#### backend
- README.md

(2024-01-15 16:30)
```

## Installation

### Manual Installation
1. Download the latest release (`main.js`, `manifest.json`)
2. Create a folder `gitlog-summary` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Enable the plugin in Obsidian Settings > Community Plugins

### From Source
```bash
git clone https://github.com/takeshy/obsidian-gitlog-summary
cd obsidian-gitlog-summary
npm install
npm run build
```

Copy `main.js` and `manifest.json` to your vault's plugin folder.

## Configuration

### Author email
Filter commits by author email. Leave empty to show all authors.

### Git directories
Specify the git repositories to monitor, one per line.

**Important:** Full path required (e.g., `/home/user/project`). The `~` shortcut is not supported.

## Usage

1. Open a note where you want to insert the git log
2. Open the command palette (Ctrl/Cmd + P)
3. Search for "Insert today's Git log"
4. The git log summary will be inserted at the cursor position

## Requirements

- Obsidian v0.15.0 or higher
- Git installed and accessible from command line
- **Desktop only** - This plugin requires Node.js APIs and does not work on mobile

## Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

## License

MIT
