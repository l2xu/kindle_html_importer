import { Plugin, Notice , App, PluginSettingTab, Setting, TFolder, Modal } from "obsidian";
import * as cheerio from "cheerio";



interface KindleHighlightsSettings {
	path: string;
}

const DEFAULT_SETTINGS: KindleHighlightsSettings = {
	path: "/",
};

export default class KindleHighlightsPlugin extends Plugin {
	settings: KindleHighlightsSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "display-modal",
			name: "Import Highlights from HTML file",
			callback: () => {
				new FilePickerModal(this.app, (value) => {
					const reader = new FileReader();
					reader.onload = () => this.handleFileLoad(reader.result);
					reader.readAsText(value);
				}).open();
			},
		});

		this.addSettingTab(new KindleHighlightsSettingsTab(this.app, this));

		
	}

	async handleFileLoad(fileContents: string | ArrayBuffer | null) {
		if (!fileContents) return;

		const $ = cheerio.load(fileContents as string);
		const bookTitle = $(".bookTitle")
			.text()
			.trim()
			.replace(/[\\/*<>:|?"]/g, "");
		const author = $(".authors").text().trim();
		author.replace(/[\\/*<>:|?"]/g, "");

		let content = "";
		let highlightsCounter = 0;

		$(".noteHeading").each((index, element) => {
			if ($(element).children("span").length !== 1) return;

			const pageMatch = $(element)
				.text()
				.match(/(Page|Location) (\d+)/);
			const pageNumber = pageMatch ? pageMatch[2] : null;
			const noteText = $(element).next(".noteText").text().trim();

			content += `${noteText}\n- ${pageMatch ? pageMatch[1] : ""} ${
				pageNumber || ""
			}\n\n`;

			if (
				$(element).next().next().children("span").length === 0 &&
				!$(element).next().next().hasClass("sectionHeading") &&
				$(element).next().next().length !== 0
			) {
				const userNote = $(element)
					.next()
					.next()
					.next(".noteText")
					.text()
					.trim();
				content += `>[!${userNote}] \n\n`;
			}

			content += "---\n\n";
			highlightsCounter++;
		});

		const frontmatter = `---\nauthor: "[[${author}]]"\nhighlights: ${highlightsCounter}\n---\n`;

		try {
			await this.app.vault.create(
				`${this.settings.path}/${bookTitle}.md`,
				`${frontmatter}\n\n## Highlights \n\n${content}`
			);
			new Notice("File created");
		} catch (error) {
			
			if(error.code === "ENOENT")
			{
				new Notice("Invalid path. Please select a valid folder in the plugin settings");
			}else{
				new Notice("File already exists");
			}
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	
}

class FilePickerModal extends Modal {
	callback: (value: File) => void; // Add this line


	constructor(app: App, callback: (value: File) => void){
		super(app);
		this.callback = callback;
	}

	onOpen() {
		const { contentEl } = this;
	
		contentEl.createEl("h1", { text: "Import Highlights from HTML file" });
		contentEl.createEl("br");
		contentEl.createEl("p", { text: "Select your kindle html file:"});
		const input = contentEl.createEl("input", {
			type: "file",
			attr: { single: "" },
		});
		contentEl.createEl("br");
		contentEl.createEl("br");
		
	

		const button = contentEl.createEl("button", {
			text: "Import Highlights from the file",
		});
		button.addEventListener("click", () => {
			const reader = new FileReader();

			if (input.files) {
				reader.readAsText(input.files[0]);	
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

	display():void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h1", { text: "Kindle Highlights Settings" });

		const folders: string[] = this.app.vault
			.getAllLoadedFiles()
			.filter(
				(file) =>
					this.app.vault.getAbstractFileByPath(file.path) instanceof
					TFolder
			)
			.map((folderFile) => folderFile.path);

		new Setting(containerEl)
			.setName("File path")
			.setDesc("Select the folder where you want to save your highlights")
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					...folders.reduce(
						(acc, cur) => ({ ...acc, [cur]: cur }),
						{}
					),
				});
				dropdown.setValue(this.plugin.settings.path);
				dropdown.onChange(async (value) => {
					this.plugin.settings.path = value;
					await this.plugin.saveSettings();
				});
			});
		
	}
}


