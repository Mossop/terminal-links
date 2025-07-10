import {
  ExtensionContext,
  TerminalLink,
  TerminalLinkContext,
  window,
  Uri,
  env,
  workspace,
  ConfigurationChangeEvent,
  LogOutputChannel,
} from "vscode";
import * as path from "path";

interface Config {
  regex: RegExp;
  uriPattern: string;
}

let LINKS: Config[] = [];
let CHANNEL: LogOutputChannel;

class FoundLink extends TerminalLink {
  #uri: Uri;

  constructor(startIndex: number, length: number, uri: Uri) {
    super(startIndex, length, uri.toString());

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
  CHANNEL?.info("Parsing config:\n" + JSON.stringify(matchers, null, 2));
  try {
    parseMatchers(matchers);
  } catch (e) {
    CHANNEL?.error(e as string | Error);
    return;
  }

  CHANNEL?.trace(
    "Parsed config:\n" +
      LINKS.map((config, i) =>
        `  {\n    regex: "${config.regex.source}",\n    uri: "${config.uriPattern}"\n  }`
      ).join("\n")
  );
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
      await env.openExternal(link.uri);
    },

    provideTerminalLinks(context: TerminalLinkContext): FoundLink[] {
      let links: FoundLink[] = [];

      let { line } = context;
      let index = 0;

      while (line.length) {
        let first: [RegExpExecArray, Config] | null = null;

        for (let { regex, uriPattern } of LINKS) {
          CHANNEL.trace(`Matching line '${line}' against ${regex.source}`);
          let result = regex.exec(line);

          if (result) {
            if (!first || first[0].index > result.index) {
              first = [result, { regex, uriPattern }];
            }
          }
        }

        if (!first) {
          break;
        }

        let [match, { regex, uriPattern }] = first;
        let uri = Uri.parse(match[0].replace(regex, uriPattern), true);
        links.push(new FoundLink(match.index + index, match[0].length, uri));

        line = line.substring(match.index + match[0].length);
        index += match.index + match[0].length;
      }

      return links;
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
  const wsFolders = workspace.workspaceFolders || [];
  const wsFolder = wsFolders[0] || undefined;
  const wsPath = wsFolder?.uri.fsPath || "";
  const wsBasename = wsFolder ? path.basename(wsFolder.uri.fsPath) : "";
  const userHome = process.env.HOME || process.env.USERPROFILE || "";
  const cwd = process.cwd();
  const pathSeparator = path.sep;

  CHANNEL?.trace(`[expandVariables] input: ${input}`);

  function envVar(name: string): string {
    return process.env[name] || "";
  }

  function getWorkspaceFolderPath(name: string): string {
    const folder = wsFolders.find(f => path.basename(f.uri.fsPath) === name || f.name === name);
    return folder ? folder.uri.fsPath : "";
  }
  function getWorkspaceFolderBasename(name: string): string {
    const folder = wsFolders.find(f => path.basename(f.uri.fsPath) === name || f.name === name);
    return folder ? path.basename(folder.uri.fsPath) : "";
  }

  // Replace all supported variables, including scoped per workspace folder
  const result = input
    .replace(/\${userHome}/g, userHome)
    .replace(/\${workspaceFolder}/g, wsPath)
    .replace(/\${workspaceFolderBasename}/g, wsBasename)
    .replace(/\${cwd}/g, cwd)
    .replace(/\${pathSeparator}/g, pathSeparator)
    .replace(/\${\/}/g, pathSeparator)
    .replace(/\${env:([A-Za-z0-9_]+)}/g, (_, name) => envVar(name))
    // Scoped per workspace folder: ${workspaceFolder:FolderName}
    .replace(/\${workspaceFolder:([^}]+)}/g, (_, name) => getWorkspaceFolderPath(name))
    .replace(/\${workspaceFolderBasename:([^}]+)}/g, (_, name) => getWorkspaceFolderBasename(name));

  CHANNEL?.trace(`[expandVariables] result: ${result}`);
  return result;
}
