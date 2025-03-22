import { Plugin, MarkdownView, Editor, debounce, PluginSettingTab, Setting } from 'obsidian';

interface SyllableCounterSettings {
    maxLinesToProcess: number;
    updateDebounceInterval: number;
    onlyVisibleRange: boolean;
    showZeroSyllables: boolean;
}

const DEFAULT_SETTINGS: SyllableCounterSettings = {
    maxLinesToProcess: 500,
    updateDebounceInterval: 500,
    onlyVisibleRange: true,
    showZeroSyllables: false
};

export default class SyllableCounterPlugin extends Plugin {
    settings: SyllableCounterSettings;
    private syllableMarkers: HTMLElement[] = [];
    private observer: MutationObserver | null = null;
    private styleEl: HTMLElement | null = null;
    private updateSyllableCountsDebounced: (view: MarkdownView) => void;
    private isProcessing: boolean = false;
    private pendingUpdate: boolean = false;

    async onload() {
        console.log('Loading Syllable Counter plugin');
        
        // Load settings
        await this.loadSettings();
        
        // Create debounced update function
        this.updateSyllableCountsDebounced = debounce(
            (view: MarkdownView) => this.updateSyllableCounts(view),
            this.settings.updateDebounceInterval
        );

        // Add the styles
        this.loadStyles();

        // Register an event to update syllable counts when the editor changes
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor, view) => {
                if (view instanceof MarkdownView) {
                    this.updateSyllableCountsDebounced(view);
                }
            })
        );

        // Register an event to update syllable counts when the active leaf changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf && leaf.view instanceof MarkdownView) {
                    this.updateSyllableCountsDebounced(leaf.view);
                } else {
                    this.clearSyllableMarkers();
                }
            })
        );

        // Register an event to update when editor scrolls
        this.registerDomEvent(document, 'scroll', debounce((e: Event) => {
            const target = e.target as HTMLElement;
            if (target && target.closest('.markdown-source-view')) {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && this.settings.onlyVisibleRange) {
                    this.updateSyllableCountsDebounced(activeView);
                }
            }
        }, 300));

        // Set up mutation observer to handle editor DOM changes
        this.setupMutationObserver();

        // Update syllable counts for the current view
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            this.updateSyllableCountsDebounced(activeView);
        }
        
        // Add settings tab
        this.addSettingTab(new SyllableCounterSettingTab(this.app, this));
    }

    onunload() {
        console.log('Unloading Syllable Counter plugin');
        this.clearSyllableMarkers();
        
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        if (this.styleEl && this.styleEl.parentNode) {
            this.styleEl.remove();
            this.styleEl = null;
        }
    }
    
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // Update the debounced function with new interval
        this.updateSyllableCountsDebounced = debounce(
            (view: MarkdownView) => this.updateSyllableCounts(view),
            this.settings.updateDebounceInterval
        );
        
        // Refresh the view with new settings
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            this.updateSyllableCountsDebounced(activeView);
        }
    }

    private loadStyles() {
        // Add a style element to the document head
        const styleEl = document.createElement('style');
        styleEl.id = 'syllable-counter-styles';
        styleEl.textContent = `
            .syllable-marker {
                color: var(--text-muted);
                font-size: 12px;
                font-family: var(--font-monospace);
                position: absolute;
                right: 10px;
                opacity: 0.7;
                pointer-events: none;
                user-select: none;
                z-index: 1;
            }
        `;
        document.head.appendChild(styleEl);
        this.styleEl = styleEl;
    }

    private setupMutationObserver() {
        // Create a mutation observer to detect when the editor content changes
        this.observer = new MutationObserver(debounce((mutations) => {
            // Check if any mutations are relevant to the editor
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView) return;
            
            const editorElement = activeView.containerEl.querySelector('.cm-editor');
            if (!editorElement) return;
            
            // Only process if mutations affect the editor content
            const isRelevant = mutations.some(mutation => {
                return mutation.type === 'childList' && 
                       (editorElement.contains(mutation.target) || 
                        mutation.target === editorElement);
            });
            
            if (isRelevant) {
                this.updateSyllableCountsDebounced(activeView);
            }
        }, 300));

        // Start observing only the editor container instead of the entire body
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            const editorContainer = activeView.containerEl.querySelector('.markdown-source-view');
            if (editorContainer) {
                this.observer.observe(editorContainer, {
                    childList: true,
                    subtree: true,
                    attributes: false,
                    characterData: false
                });
            }
        }
    }

    private clearSyllableMarkers() {
        try {
            // Remove all syllable markers
            this.syllableMarkers.forEach(marker => {
                if (marker && marker.parentNode) {
                    marker.remove();
                }
            });
        } catch (e) {
            console.error('Error clearing syllable markers:', e);
        }
        this.syllableMarkers = [];
    }

    private getVisibleLineRange(editorElement: HTMLElement): { start: number, end: number } | null {
        if (!editorElement) return null;
        
        const editorRect = editorElement.getBoundingClientRect();
        const lineElements = editorElement.querySelectorAll('.cm-line');
        if (!lineElements || lineElements.length === 0) return null;
        
        let startLine = -1;
        let endLine = -1;
        
        // Find visible lines
        for (let i = 0; i < lineElements.length; i++) {
            const lineRect = lineElements[i].getBoundingClientRect();
            
            // Check if line is visible
            const isVisible = (
                lineRect.bottom >= editorRect.top - 100 && // Add some buffer
                lineRect.top <= editorRect.bottom + 100    // Add some buffer
            );
            
            if (isVisible) {
                if (startLine === -1) startLine = i;
                endLine = i;
            } else if (startLine !== -1 && lineRect.top > editorRect.bottom) {
                // We've gone past the visible area, no need to check further
                break;
            }
        }
        
        if (startLine === -1) return null;
        
        // Add buffer lines before and after
        startLine = Math.max(0, startLine - 10);
        endLine = Math.min(lineElements.length - 1, endLine + 10);
        
        return { start: startLine, end: endLine };
    }

    private async updateSyllableCounts(view: MarkdownView) {
        // If already processing, mark as pending and return
        if (this.isProcessing) {
            this.pendingUpdate = true;
            return;
        }
        
        this.isProcessing = true;
        this.pendingUpdate = false;
        
        try {
            // Clear existing markers
            this.clearSyllableMarkers();

            // Get the editor content
            const editor = view.editor;
            if (!editor) {
                this.isProcessing = false;
                return;
            }
            
            // Find the editor element
            const editorElement = view.containerEl.querySelector('.cm-editor');
            if (!editorElement) {
                this.isProcessing = false;
                return;
            }

            // Find all line elements
            const lineElements = editorElement.querySelectorAll('.cm-line');
            if (!lineElements || lineElements.length === 0) {
                this.isProcessing = false;
                return;
            }
            
            // Determine which lines to process
            let startLine = 0;
            let endLine = Math.min(lineElements.length - 1, this.settings.maxLinesToProcess - 1);
            
            // If only processing visible range, get visible line range
            if (this.settings.onlyVisibleRange) {
                const visibleRange = this.getVisibleLineRange(editorElement as HTMLElement);
                if (visibleRange) {
                    startLine = visibleRange.start;
                    endLine = visibleRange.end;
                    
                    // Ensure we don't process too many lines
                    if (endLine - startLine + 1 > this.settings.maxLinesToProcess) {
                        endLine = startLine + this.settings.maxLinesToProcess - 1;
                    }
                }
            }
            
            // Create a document fragment to batch DOM operations
            const fragment = document.createDocumentFragment();
            
            // Get content lines
            const content = editor.getValue();
            const lines = content.split('\n');
            
            // Process each line in the determined range
            for (let index = startLine; index <= endLine; index++) {
                if (index >= lines.length || index >= lineElements.length) continue;
                
                const line = lines[index];
                const syllableCount = this.countSyllables(line);
                
                // Only add markers for lines with syllables > 0 or if showZeroSyllables is enabled
                if (syllableCount > 0 || this.settings.showZeroSyllables) {
                    const lineElement = lineElements[index] as HTMLElement;
                    if (!lineElement) continue;
                    
                    // Create the syllable marker
                    const marker = document.createElement('div');
                    marker.className = 'syllable-marker';
                    marker.textContent = `${syllableCount} ${syllableCount === 1 ? 'syllable' : 'syllables'}`;
                    
                    // Position the marker relative to the line
                    if (lineElement.offsetTop !== undefined) {
                        marker.style.top = `${lineElement.offsetTop}px`;
                    }
                    
                    // Add the marker to the fragment
                    fragment.appendChild(marker);
                    
                    // Store the marker for later cleanup
                    this.syllableMarkers.push(marker);
                }
            }
            
            // Add all markers to the DOM in a single operation
            editorElement.appendChild(fragment);
            
        } catch (e) {
            console.error('Error updating syllable counts:', e);
        } finally {
            this.isProcessing = false;
            
            // If an update was requested while processing, schedule another update
            if (this.pendingUpdate) {
                setTimeout(() => {
                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (activeView) {
                        this.updateSyllableCountsDebounced(activeView);
                    }
                }, 50);
            }
        }
    }

    private countSyllables(word: string): number {
        try {
            // Remove non-alphabetic characters
            word = word.toLowerCase().replace(/[^a-z]/g, ' ').trim();
            
            if (!word) return 0;
            
            // Split into words
            const words = word.split(/\s+/);
            let totalSyllables = 0;
            
            for (const w of words) {
                if (!w) continue;
                
                // Count syllables in each word
                let syllables = 0;
                
                // Special case for single letter words
                if (w.length === 1) {
                    totalSyllables += 1;
                    continue;
                }
                
                // Count vowel groups
                const vowels = 'aeiouy';
                let isPrevVowel = false;
                
                for (let i = 0; i < w.length; i++) {
                    const isVowel = vowels.includes(w[i]);
                    if (isVowel && !isPrevVowel) {
                        syllables++;
                    }
                    isPrevVowel = isVowel;
                }
                
                // Adjust for common patterns
                
                // Silent e at the end
                if (w.endsWith('e') && syllables > 1 && !w.endsWith('le')) {
                    syllables--;
                }
                
                // Words ending with 'le' usually form a syllable
                if (w.endsWith('le') && w.length > 2 && !vowels.includes(w[w.length - 3])) {
                    syllables++;
                }
                
                // Ensure at least one syllable per word
                if (syllables === 0) {
                    syllables = 1;
                }
                
                totalSyllables += syllables;
            }
            
            return totalSyllables;
        } catch (e) {
            console.error('Error counting syllables:', e);
            return 0;
        }
    }
}

// Settings tab
class SyllableCounterSettingTab extends PluginSettingTab {
    plugin: SyllableCounterPlugin;

    constructor(app: any, plugin: SyllableCounterPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Syllable Counter Settings' });

        new Setting(containerEl)
            .setName('Maximum Lines to Process')
            .setDesc('Limit the number of lines to process for better performance')
            .addSlider(slider => slider
                .setLimits(100, 2000, 100)
                .setValue(this.plugin.settings.maxLinesToProcess)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxLinesToProcess = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Update Delay')
            .setDesc('Delay in milliseconds before updating syllable counts after changes')
            .addSlider(slider => slider
                .setLimits(100, 2000, 100)
                .setValue(this.plugin.settings.updateDebounceInterval)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.updateDebounceInterval = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Only Process Visible Range')
            .setDesc('Only count syllables for visible lines (improves performance)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.onlyVisibleRange)
                .onChange(async (value) => {
                    this.plugin.settings.onlyVisibleRange = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Zero Syllable Lines')
            .setDesc('Show syllable count for lines with zero syllables')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showZeroSyllables)
                .onChange(async (value) => {
                    this.plugin.settings.showZeroSyllables = value;
                    await this.plugin.saveSettings();
                }));
    }
}
