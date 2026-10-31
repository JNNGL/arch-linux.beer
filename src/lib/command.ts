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

	return [quote ? "unterminated quoted string" : null, tokens];
}

export function processCommand(command: string, outputPipe: Array<string>): number {
	const tokenizationResult = tokenize(command);
	const error = tokenizationResult[0];
	const tokens = tokenizationResult[1];

	if (error !== null) {
		outputPipe.push("sh: " + error);
		return -1;
	}

	return 0;
}