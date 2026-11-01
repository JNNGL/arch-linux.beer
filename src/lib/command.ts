import type { OutputPipe } from '#lib/pipe.ts';
import type { FindQueryResult } from '#lib/filesystem.ts';
import { currentWorkingDirectory, find, FIND_FILE } from '#lib/filesystem.ts';
import type { VirtualFile } from '#lib/file.ts';

function tokenize(command: string): [string | null, Array<string>] {
	const tokens: string[] = [];

	let currentToken = "";
	let quote = false;
	let escape = false;
	for (let i = 0; i < command.length; i++) {
		if (escape) {
			currentToken += command.charAt(i);
			escape = false;
		} else {
			if (command.charAt(i) === "\\") {
				escape = true;
			} else if (command.charAt(i) === "\"") {
				quote = !quote;
			} else if (!quote && command.charAt(i) === " ") {
				if (currentToken !== "") {
					tokens.push(currentToken);
					currentToken = "";
				}
			} else {
				currentToken += command.charAt(i);
			}
		}
	}

	if (currentToken !== "") {
		tokens.push(currentToken);
	}

	return [quote ? "unterminated quoted string" : null, tokens];
}

export function processCommand(command: string, outputPipe: OutputPipe): number {
	const tokenizationResult = tokenize(command);
	const error = tokenizationResult[0];
	const tokens = tokenizationResult[1];

	if (error !== null) {
		outputPipe('sh: ' + error);
		return -1;
	}

	if (tokens.length === 0) {
		return 0;
	}

	let result: FindQueryResult = { type: 0, result: null, directory: "" };

	if (!tokens[0].includes("/")) {
		result = find(tokens[0], "/bin", FIND_FILE);
	}

	const localResult = find(tokens[0], currentWorkingDirectory, FIND_FILE);
	if (result.type == 0 || localResult.type == FIND_FILE) {
		result = localResult;
	}

	if (result.type == 0) {
		outputPipe("sh: command not found: " + tokens[0]);
		return -1;
	}

	if (result.type == -1) {
		outputPipe("sh: is a directory: " + tokens[0]);
		return -1;
	}

	if ((result.result as VirtualFile).exec == null) {
		outputPipe("sh: not an executable: " + tokens[0]);
		return -1;
	}

	return (result.result as VirtualFile).exec!(tokens.slice(1), outputPipe);
}