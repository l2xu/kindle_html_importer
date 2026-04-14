import {
	Plugin,
	Notice,
	App,
	PluginSettingTab,
	Setting,
	TFolder,
	Modal,
	normalizePath,
} from "obsidian";
import * as cheerio from "cheerio";

interface KindleHighlightsSettings {
	path: string;
}

interface ParsedHighlights {
	bookTitle: string;
	author: string;
	content: string;
	highlightsCounter: number;
}

const DEFAULT_SETTINGS: KindleHighlightsSettings = {
	path: "/",
};

export default class KindleHighlightsPlugin extends Plugin {
	settings!: KindleHighlightsSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "openKindleHighlightsModal",
			name: "Import Highlights from HTML file",
			callback: () => {
				new FilePickerModal(this.app, (file) => {
					const reader = new FileReader();
					reader.onload = () => this.handleFileLoad(reader.result);
					reader.readAsText(file);
				}).open();
			},
		});

		this.addSettingTab(new KindleHighlightsSettingsTab(this.app, this));
	}

	private sanitizeFilename(name: string): string {
		return name.replace(/[\\/*<>:|?"]/g, "");
	}

	private parseHighlights(html: string): ParsedHighlights {
		const $ = cheerio.load(html);
		const bookTitle = this.sanitizeFilename($(".bookTitle").text().trim());
		const author = this.sanitizeFilename($(".authors").text().trim());

		let content = "";
		let highlightsCounter = 0;

		$(".noteHeading").each((_, element) => {
			const $heading = $(element);
			const headingText = $heading.text().trim();

			// Skip user notes (Notiz) — attached inline to the preceding highlight below
			if (/^Notiz/.test(headingText)) return;

			// Only process coloured highlights (exactly one colour span)
			if ($heading.children("span").length !== 1) return;

			const chapter = $heading
				.prevAll(".sectionHeading")
				.first()
				.text()
				.trim();
			// Support English (Page/Location) and German (Seite) exports
			const pageMatch = headingText.match(/(Page|Location|Seite) (\d+)/);
			const noteText = $heading.next(".noteText").text().trim();

			// Metadata line: chapter · page
			const metaParts: string[] = [];
			if (chapter) metaParts.push(`*${chapter}*`);
			if (pageMatch) metaParts.push(`${pageMatch[1]} ${pageMatch[2]}`);
			if (metaParts.length > 0) content += `${metaParts.join(" · ")}\n\n`;

			content += `${noteText}\n\n`;

			// Attach user note (Notiz) if the next noteHeading is one
			const $afterNoteText = $heading.next(".noteText").next();
			if (
				$afterNoteText.hasClass("noteHeading") &&
				/^Notiz/.test($afterNoteText.text().trim())
			) {
				const userNote = $afterNoteText.next(".noteText").text().trim();
				if (userNote) content += `>[!note] ${userNote}\n\n`;
			}

			content += "---\n\n";
			highlightsCounter++;
		});

		return { bookTitle, author, content, highlightsCounter };
	}

	async handleFileLoad(fileContents: string | ArrayBuffer | null) {
		if (!fileContents) return;

		const { bookTitle, author, content, highlightsCounter } =
			this.parseHighlights(fileContents as string);

		const frontmatter = `---\nauthor: "[[${author}]]"\nhighlights: ${highlightsCounter}\n---\n`;
		const filePath = normalizePath(`${this.settings.path}/${bookTitle}.md`);

		try {
			await this.app.vault.create(
				filePath,
				`${frontmatter}\n\n## Highlights \n\n${content}`,
			);
			new Notice("File created");
		} catch (error) {
			if (
				error instanceof Error &&
				(error as NodeJS.ErrnoException).code === "ENOENT"
			) {
				new Notice(
					"Invalid path. Please select a valid folder in the plugin settings",
				);
			} else {
				new Notice("File already exists");
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class FilePickerModal extends Modal {
	private readonly callback: (file: File) => void;

	constructor(app: App, callback: (file: File) => void) {
		super(app);
		this.callback = callback;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h1", { text: "Import Highlights from HTML file" });
		contentEl.createEl("br");
		contentEl.createEl("p", { text: "Select your kindle html file:" });
		const input = contentEl.createEl("input", {
			type: "file",
			attr: { accept: ".html" },
		});
		contentEl.createEl("br");
		contentEl.createEl("br");

		const button = contentEl.createEl("button", {
			text: "Import Highlights from the file",
		});
		button.addEventListener("click", () => {
			if (input.files?.[0]) {
				this.callback(input.files[0]);
				this.close();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class KindleHighlightsSettingsTab extends PluginSettingTab {
	plugin: KindleHighlightsPlugin;

	constructor(app: App, plugin: KindleHighlightsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.map((f) => f.path);

		new Setting(containerEl)
			.setName("File path")
			.setDesc("Select the folder where you want to save your highlights")
			.addDropdown((dropdown) => {
				dropdown.addOptions(
					Object.fromEntries(folders.map((f) => [f, f])),
				);
				dropdown.setValue(this.plugin.settings.path);
				dropdown.onChange(async (value) => {
					this.plugin.settings.path = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
