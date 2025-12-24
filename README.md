# Git Log Summary for Obsidian

An Obsidian plugin that inserts today's git log summary into your notes.

## Settings
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
## project-a
### Commits
- 09:30 Add new feature
### Staged
- src/index.ts

## project-b
### Commits
- 10:45 Fix bug in login
### Unstaged
- README.md
- config.json (new)

(2024-01-15 16:30)
```

## Template Customization

The output format can be customized using [Handlebars](https://handlebarsjs.com/) template syntax in the settings.

### Available Variables

| Context | Variables |
|---------|-----------|
| Commits | `{{time}}`, `{{repo}}`, `{{message}}` |
| Staged/Unstaged | `{{repo}}`, `{{file}}` |
| Global | `{{repositories}}`, `{{timestamp}}` |

- `{{repositories}}` - Array of repository objects, each with `{{name}}`, `{{commits}}`, `{{staged}}`, `{{unstaged}}`

### Built-in Helpers

- `{{#if commits}}...{{/if}}` - Conditional rendering
- `{{#each commits}}...{{/each}}` - Loop over items
- `{{#unless}}...{{/unless}}` - Negative conditional
- `{{else}}` - Else clause
- `{{~` / `~}}` - Trim whitespace (e.g., `{{/each~}}` removes trailing newline)

### Custom Helpers

- `{{#eq value "string"}}...{{else}}...{{/eq}}` - Equal comparison
- `{{#ne value "string"}}...{{/ne}}` - Not equal comparison
- `{{#contains value "substring"}}...{{/contains}}` - String contains check
- `{{#startsWith value "prefix"}}...{{/startsWith}}` - String starts with check
- `(array "a" "b" "c")` - Create inline array for use with `{{#each}}`
- `{{#some array field="value"}}...{{/some}}` - Check if any item matches conditions
  - `fieldStartsWith="prefix"` - prefix matching (e.g., `messageStartsWith="fix"`)
  - `fieldNotStartsWithAny="a,b"` - exclude multiple prefixes
- `(or a b c)` - Returns true if any value is truthy (for arrays, checks length > 0)

### Template Examples

#### Group commits by repository and type

This example groups commits by repository, then by type (Bug fixes, Design, Features).

**Prerequisites:**
- Commits are categorized by message prefix:
  - `fix` prefix → Bug fixes
  - `design` prefix → Design
  - Other → Features
- Display names (`frontend`, `backend`) can be customized in the `{{#eq}}` blocks

```handlebars
{{#each repositories~}}
{{#if (or commits staged unstaged)}}
## {{#eq name "my-app"}}frontend{{else}}{{#eq name "api-server"}}backend{{else}}{{name}}{{/eq}}{{/eq}}
{{#some commits messageStartsWith="fix"}}
### Bug fixes
{{#each commits~}}
{{#startsWith message "fix"~}}
- {{time}} {{message}}
{{/startsWith~}}
{{/each}}
{{/some~}}
{{#some commits messageStartsWith="design"}}
### Design
{{#each commits~}}
{{#startsWith message "design"~}}
- {{time}} {{message}}
{{/startsWith~}}
{{/each}}
{{/some~}}
{{#some commits messageNotStartsWithAny="fix,design"}}
### Features
{{#each commits~}}
{{#startsWith message "fix"}}{{else}}{{#startsWith message "design"}}{{else~}}
- {{time}} {{message}}
{{/startsWith}}{{/startsWith~}}
{{/each}}
{{/some~}}
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
```

Output:
```markdown
## frontend
### Bug fixes
- 10:30 fix: resolve login issue
- 14:00 fix: handle null pointer
### Design
- 11:00 design: update button styles
### Features
- 09:00 add user profile page
### Staged
- src/components/Button.tsx

## backend
### Features
- 12:00 add health check endpoint
### Unstaged
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
