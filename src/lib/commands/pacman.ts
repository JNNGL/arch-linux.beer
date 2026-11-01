import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';

type Operation = 'sync' | 'remove' | 'query';

const help = [
	'usage: pacman <operation> [options] [targets...]',
	'',
	'operations:',
	'  -S, --sync       install or synchronize packages',
	'  -R, --remove     remove packages',
	'  -Q, --query      query the local package database',
	'options:',
	'  -y, --refresh    refresh package databases',
	'  -u, --sysupgrade upgrade installed packages',
	'  -s, --search     search sync repositories',
	'  -h, --help       show this help',
	'  -V, --version    show the version',
].join('\n');

export const pacmanCommandFile: VirtualFile = {
	...dummyFile,
	name: 'pacman',
	exec: (args: string[], output: OutputPipe) => {
		let operation: Operation | null = null;
		let refresh = false;
		let upgrade = false;
		let search = false;
		let shortSearch = false;
		let showHelp = false;
		let showVersion = false;
		let parsingOptions = true;
		let optionError = '';
		const targets: string[] = [];

		const selectOperation = (next: Operation) => {
			if (operation && operation !== next) {
				optionError = 'only one operation may be used at a time';
			} else {
				operation = next;
			}
		};

		for (const arg of args) {
			if (parsingOptions && arg === '--') {
				parsingOptions = false;
				continue;
			}

			if (parsingOptions && arg.startsWith('--')) {
				switch (arg) {
					case '--sync': selectOperation('sync'); break;
					case '--remove': selectOperation('remove'); break;
					case '--query': selectOperation('query'); break;
					case '--refresh': refresh = true; break;
					case '--sysupgrade': upgrade = true; break;
					case '--search': search = true; break;
					case '--help': showHelp = true; break;
					case '--version': showVersion = true; break;
					case '--noconfirm': break;
					default: optionError = `invalid option '${arg}'`;
				}
				if (optionError) break;
				continue;
			}

			if (parsingOptions && arg.startsWith('-') && arg !== '-') {
				for (const flag of arg.slice(1)) {
					switch (flag) {
						case 'S': selectOperation('sync'); break;
						case 'R': selectOperation('remove'); break;
						case 'Q': selectOperation('query'); break;
						case 'y': refresh = true; break;
						case 'u': upgrade = true; break;
					case 's': shortSearch = true; break;
						case 'h': showHelp = true; break;
						case 'V': showVersion = true; break;
						case 'n': break;
						default: optionError = `invalid option -- '${flag}'`;
					}
					if (optionError) break;
				}
				if (optionError) break;
				continue;
			}

			targets.push(arg);
		}

		if (optionError) {
			output(`error: ${optionError}\n`);
			return -1;
		}
		if (showHelp) {
			output(`${help}\n`);
			return 0;
		}
		if (showVersion) {
			output('pacman 7.1.0\n');
			return 0;
		}
		if (operation === 'remove' && search) {
			output('error: --search is not valid with --remove\n');
			return -1;
		}
		if (operation === 'remove') search = false;
		else search ||= shortSearch;
		if (!operation) {
			output('error: no operation specified (use -h for help)\n');
			return -1;
		}

		if (operation === 'sync') {
			if (search && targets.length === 0) {
				output('error: no targets specified for search\n');
				return -1;
			}
			if (!refresh && !upgrade && !search && targets.length === 0) {
				output('error: no targets specified for installation\n');
				return -1;
			}
			if (refresh) {
				output(':: Synchronizing package databases...\nerror: failed to reach mirror.archlinux.org: no internet connection\nerror: failed to synchronize all databases\n');
				return -1;
			}
			if (search) {
				output('error: no internet connection; cannot search the sync repositories\n');
				return -1;
			}
			if (upgrade) {
				output(':: Starting full system upgrade...\nerror: no internet connection\n');
				return -1;
			}
			output(`:: Resolving dependencies...\nerror: no internet connection\n`);
			return -1;
		}

		if (refresh || upgrade || search) {
			output('error: option is not valid with this operation\n');
			return -1;
		}
		if (operation === 'remove') {
			if (targets.length === 0) {
				output('error: no targets specified for removal\n');
				return -1;
			}
			output(targets.map((target) => `error: target not found: ${target} (not installed in the package database)`).join('\n') + '\n');
			return -1;
		}

		if (targets.length === 0) {
			output('No packages installed in the local database.\n');
			return 0;
		}
		output(targets.map((target) => `error: package '${target}' was not found in the local database`).join('\n') + '\n');
		return -1;
	}
};
