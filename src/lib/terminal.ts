export function wrapTerminalItems(items: string[], columns: number, separator = '  '): string[] {
	const rows: string[] = [];
	let row = '';
	const maxColumns = Math.max(1, columns);

	for (const item of items) {
		const next = row ? `${row}${separator}${item}` : item;
		if (row && next.length > maxColumns) {
			rows.push(row);
			row = item;
		} else {
			row = next;
		}
	}

	if (row) rows.push(row);
	return rows;
}
