"use strict";

import { exec } from "child_process";
import { quote } from "shell-quote";
import { window, commands, ExtensionContext, workspace, Selection, QuickPickItem, QuickPickOptions } from "vscode";
import { isNumber } from "util";

const MAX_DESC_LENGTH = 1000;
const MAX_BUF_SIZE = 200000 * 1024;

const projectRoot = workspace.rootPath ? workspace.rootPath : ".";

interface QuickPickItemWithLine extends QuickPickItem {
  num: number;
}

function fetchItems(command: string, projectRoot: string): Promise<QuickPickItemWithLine[]> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: projectRoot, maxBuffer: MAX_BUF_SIZE }, (err, stdout, stderr) => {
      if (stderr) {
        window.showErrorMessage(stderr);
        return resolve([]);
      }
      const lines = stdout.split(/\n/).filter(l => l !== "");
      if (!lines.length) {
        window.showInformationMessage("There are no items.");
        return resolve([]);
      }
      return resolve(
        lines
          .map(line => {
            const [fullPath, num, ...desc] = line.split(":");
            const description = desc.join(":").trim();
            return {
              fullPath,
              num: Number(num),
              line,
              description,
            };
          })
          .filter(({ description, num }) => description.length < MAX_DESC_LENGTH && !!num)
          .map(({ fullPath, num, line, description }) => {
            const path = fullPath.split("/");
            return {
              label: `${path[path.length - 1]} : ${num}`,
              description,
              detail: fullPath,
              num,
            };
          }),
      );
    });
  });
}

export function activate(context: ExtensionContext) {
  (async () => {
    const disposable = commands.registerCommand("extension.ripgrep", async () => {
      const query = await window.showInputBox({
        prompt: "Please input search word.",
      });
      const isOption = (s: string) => /^--?[a-z]+/.test(s);
      const q = query.split(/\s/).reduce(
        (acc, c, i) => {
          if (i === 0 || isOption(c) || isOption(acc[acc.length - 1])) {
            acc.push(c);
            return acc;
          }
          acc[acc.length - 1] = acc[acc.length - 1] + ` ${c}`;
          return acc;
        },
        [] as string[],
      );
      const command = quote([require("vscode-ripgrep").rgPath, "-n", ...q]);
      const options: QuickPickOptions = { matchOnDescription: true };
      const item = await window.showQuickPick(fetchItems(command, projectRoot), options);
      if (!item) return;
      const { detail, num } = item;
      const doc = await workspace.openTextDocument(projectRoot + "/" + detail);
      await window.showTextDocument(doc);
      window.activeTextEditor.selection = new Selection(~~num, 0, ~~num, 0);
      commands.executeCommand("cursorUp");
      context.subscriptions.push(disposable);
    });
  })().catch(error => {
    window.showErrorMessage(error);
  });
}

export function deactivate() {}
