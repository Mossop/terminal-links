import {
  ExtensionContext,
  TerminalLink,
  TerminalLinkContext,
  window,
  Uri,
  env,
  commands,
  workspace,
  ConfigurationChangeEvent,
  LogOutputChannel,
  Position,
  Selection,
  Range,
} from "vscode";
import * as path from "path";

const LINE_RE = /^(.+?)(:\d+)?(:\d+)?$/;
const URL_RE = /\b(?:https?|ftp|file):\/\/[^\s]+/g;

interface Config {
  regex: RegExp;
  uriPattern: string;
}

interface Match {
  index: number;
  text: string;
  config?: Config;
}

let LINKS: Config[] = [];
let CHANNEL: LogOutputChannel;

class FoundLink extends TerminalLink {
  #uri: Uri;

  constructor(startIndex: number, length: number, uri: Uri) {
    super(startIndex, length, uri.toString(true)); // Do not encode the URI in tooltips
    this.#uri = uri;
  }

  get uri(): Uri {
    return this.#uri;
  }
}

function parseMatchers(matchers: unknown) {
  function isObject(item: unknown): item is Record<string, unknown> {
    return typeof item === "object";
  }

  function asString(obj: Record<string, unknown>, key: string): string {
    let expectedFormat = `Every item of terminalLinks.matchers must contain a string ${key} property.`;
    if (!(key in obj)) {
      throw new Error(expectedFormat);
    }

    let value = obj[key];
    if (typeof value !== "string") {
      throw new Error(expectedFormat);
    }

    return value;
  }

  let expectedFormat = `terminalLinks.matchers is expected to be an array of { "regex": "...", "replacement": "..." }`;
  let foundLinks: Config[] = [];

  if (!Array.isArray(matchers)) {
    throw new Error(expectedFormat);
  }

  for (let item of matchers) {
    if (!isObject(item)) {
      throw new Error(expectedFormat);
    }

    foundLinks.push({
      regex: new RegExp(asString(item, "regex"), "g"),
      uriPattern: expandVariables(asString(item, "uri")),
    });
  }

  LINKS = foundLinks;
}

function parseConfig() {
  let config = workspace.getConfiguration(
    "terminalLinks",
    workspace.workspaceFile
  );

  let matchers = config.get("matchers") ?? [];
  CHANNEL?.info("Parsing config:\n" + JSON.stringify(matchers ?? [], null, 2));
  try {
    parseMatchers(matchers);
  } catch (e) {
    CHANNEL?.error(e as Error);
    return;
  }

  CHANNEL?.trace(
    "Parsed config:\n" +
      LINKS.map(
        (config) =>
          `  {\n    regex: "${config.regex.source}",\n    uri: "${config.uriPattern}"\n  }`
      ).join("\n")
  );
}

function collectAllMatches(line: string): Match[] {
  let matches: Match[] = Array.from(line.matchAll(URL_RE), (match) => ({
    index: match.index,
    text: match[0],
  }));

  for (let config of LINKS) {
    let { regex } = config;

    for (let match of line.matchAll(regex)) {
      CHANNEL?.trace(
        `Found match '${match[0]}' at position ${match.index} for pattern ${regex.source}`
      );

      matches.push({
        index: match.index,
        text: match[0],
        config,
      });
    }
  }

  matches.sort((a, b) => a.index - b.index);

  return matches;
}

function buildNonOverlappingLinks(matches: Match[]): FoundLink[] {
  let links: FoundLink[] = [];
  let pos = 0;

  for (let match of matches) {
    if (match.index < pos) {
      continue;
    }

    pos = match.index + match.text.length;

    if (match.config) {
      let { regex, uriPattern } = match.config;
      let uri = Uri.parse(match.text.replace(regex, uriPattern), true);
      links.push(new FoundLink(match.index, match.text.length, uri));
    }
  }

  return links;
}

export function activate(context: ExtensionContext) {
  CHANNEL = window.createOutputChannel("Terminal Links", { log: true });
  CHANNEL.info("Activated");

  parseConfig();
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
      if (e.affectsConfiguration("terminalLinks", workspace.workspaceFile)) {
        parseConfig();
      }
    }, null)
  );

  let disposable = window.registerTerminalLinkProvider({
    async handleTerminalLink(link: FoundLink): Promise<void> {
      if (link.uri.scheme === "vscode") {
        switch (link.uri.authority) {
          case "file": {
            let { path } = link.uri;
            let matches = LINE_RE.exec(path);
            let line = undefined;
            let col = undefined;
            if (matches) {
              path = matches[1];
              line = matches[2];
              col = matches[3];
            }

            let fileUri = Uri.parse(`file://${path}`, true);
            let document = await workspace.openTextDocument(fileUri);
            let editor = await window.showTextDocument(document);

            if (line) {
              line = parseInt(line.substring(1)) - 1;
              if (col) {
                col = parseInt(col.substring(1)) - 1;
              } else {
                col = 0;
              }

              let position = new Position(line, col);
              editor.selection = new Selection(position, position);
              editor.revealRange(new Range(position, position));
            }
            return;
          }
          case "settings":
            await commands.executeCommand(
              "workbench.action.openSettings",
              link.uri.path.substring(1)
            );
            return;
        }
      }
      await env.openExternal(link.uri);
    },

    provideTerminalLinks(context: TerminalLinkContext): FoundLink[] {
      // Collect all matches (URLs and custom patterns) sorted by position
      let allMatches = collectAllMatches(context.line);

      // Filter overlapping matches and build links
      return buildNonOverlappingLinks(allMatches);
    },
  });

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Nothing to do.
}

function expandVariables(input: string): string {
  // Collect workspace info
  const wsFolders = workspace.workspaceFolders ?? [];
  const wsFolder = wsFolders[0] ?? undefined;
  const wsPath = wsFolder?.uri.fsPath ?? "";
  const wsBasename = wsFolder ? path.basename(wsFolder.uri.fsPath) : "";
  const userHome = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const pathSeparator = path.sep;

  CHANNEL?.trace(`[expandVariables] input: ${input}`);

  function envVar(name: string): string {
    return process.env[name] ?? "";
  }

  function getWorkspaceFolderPath(name: string): string {
    const folder = wsFolders.find(
      (f) => path.basename(f.uri.fsPath) === name || f.name === name
    );
    return folder?.uri.fsPath ?? "";
  }
  function getWorkspaceFolderBasename(name: string): string {
    const folder = wsFolders.find(
      (f) => path.basename(f.uri.fsPath) === name || f.name === name
    );
    return folder ? path.basename(folder.uri.fsPath) : "";
  }

  // Replace all supported variables, including scoped per workspace folder
  const result = input
    .replace(/\${userHome}/g, userHome)
    .replace(/\${workspaceFolder}/g, wsPath)
    .replace(/\${workspaceFolderBasename}/g, wsBasename)
    .replace(/\${pathSeparator}/g, pathSeparator)
    .replace(/\${\/}/g, pathSeparator)
    .replace(/\${env:([A-Za-z0-9_]+)}/g, (_, name: string) => envVar(name))
    // Scoped per workspace folder: ${workspaceFolder:FolderName}
    .replace(/\${workspaceFolder:([^}]+)}/g, (_, name: string) =>
      getWorkspaceFolderPath(name)
    )
    .replace(/\${workspaceFolderBasename:([^}]+)}/g, (_, name: string) =>
      getWorkspaceFolderBasename(name)
    );

  CHANNEL?.trace(`[expandVariables] result: ${result}`);
  return result;
}
