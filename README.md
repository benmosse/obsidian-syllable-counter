# Syllable Counter

A plugin for [Obsidian](https://obsidian.md) that counts syllables per line in the editor pane and displays the count in the margin.

## Features

- Displays syllable counts for each line in the editor
- Optimized for performance with large documents
- Only processes visible lines by default (configurable)
- Customizable update delay and processing limits
- Lightweight and unobtrusive UI

## Installation

### From Obsidian

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Syllable Counter"
4. Install the plugin and enable it

### Manual Installation

1. Download the latest release from the GitHub releases page
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins/` directory
3. Reload Obsidian
4. Enable the plugin in Obsidian settings

## Usage

Once enabled, the plugin will automatically display syllable counts in the right margin of the editor. The counts update as you type or scroll through the document.

## Settings

- **Maximum Lines to Process**: Limit the number of lines to process for better performance (default: 500)
- **Update Delay**: Delay in milliseconds before updating syllable counts after changes (default: 500ms)
- **Only Process Visible Range**: Only count syllables for visible lines to improve performance (default: enabled)
- **Show Zero Syllable Lines**: Show syllable count for lines with zero syllables (default: disabled)
- **Verbosity**: Choose how syllable counts are displayed (default: verbose)
  - Verbose: Shows "5 syllables"
  - Terse: Shows just "5"

## How It Works

The plugin uses a simple algorithm to count syllables in English text:
- Counts vowel groups in each word
- Applies common rules for English syllable counting (silent e, etc.)
- Ensures each word has at least one syllable

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)
