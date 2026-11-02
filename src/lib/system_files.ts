import { dummyFile, type Directory, type VirtualFile } from '#lib/file.ts';
import { zovCommandFile } from '#lib/commands/zov.ts';

function textFile(name: string, contents: string, mode = '-rw-r--r--'): VirtualFile {
	return {
		...dummyFile,
		name,
		mode,
		in: () => contents
	};
}

function directory(name: string, children: Directory[] = [], files: VirtualFile[] = []): Directory {
	return { name, children, files };
}

function packageDirectory(name: string, packageName: string, version: string, description: string, files: string): Directory {
	return directory(name, [], [
		textFile('desc', `%NAME%\n${packageName}\n%VERSION%\n${version}\n%DESC%\n${description}\n`),
		textFile('files', `${files.trim()}\n`)
	]);
}

const networkScript = `#!/bin/sh
case "$1" in
  start)
    /sbin/ifconfig eth0 192.0.2.15 netmask 255.255.255.0 up
    /sbin/route add default gw 192.0.2.1
    ;;
  stop)
    /sbin/ifconfig eth0 down
    ;;
esac
`;

export const systemDirectories: Directory[] = [
	directory('boot', [
		directory('grub', [], [
			textFile('menu.lst', `# GRUB configuration for archbox
default 0
timeout 5

title Arch Linux 0.1
root (hd0,0)
kernel /vmlinuz-linux root=/dev/hda3 ro
initrd /initrd.img
`)
		])
	], [
		textFile('initrd.img', '[compressed initial ramdisk]\n'),
		textFile('vmlinuz-linux', '[binary Linux kernel image]\n')
	]),
	directory('dev', [], [
		textFile('cdrom', '', 'brw-rw----'),
		textFile('console', '', 'crw-------'),
		textFile('hda', '', 'brw-rw----'),
		textFile('hda1', '', 'brw-rw----'),
		textFile('hda2', '', 'brw-rw----'),
		textFile('hda3', '', 'brw-rw----'),
		textFile('null', '', 'crw-rw-rw-'),
		textFile('random', '', 'crw-rw-rw-'),
		textFile('tty', '', 'crw-rw-rw-'),
		textFile('zero', '', 'crw-rw-rw-')
	]),
	directory('etc', [
		directory('rc.d', [], [
			textFile('crond', '#!/bin/sh\n# Start the local job scheduler.\n', '-rwxr-xr-x'),
			textFile('network', networkScript, '-rwxr-xr-x'),
			textFile('rc', '#!/bin/sh\n# Start and stop services for the selected runlevel.\n', '-rwxr-xr-x'),
			textFile('rc.sysinit', '#!/bin/sh\n# Mount filesystems and initialize the system.\n', '-rwxr-xr-x'),
			textFile('syslogd', '#!/bin/sh\n# Start the system logging daemon.\n', '-rwxr-xr-x'),
			zovCommandFile,
		])
	], [
		textFile('fstab', `/dev/hda3  /          ext3     defaults        0 1
/dev/hda1  /boot      ext2     defaults        0 2
/dev/hda2  none       swap     sw              0 0
/dev/cdrom /mnt/cdrom iso9660  ro,noauto,user  0 0
none       /proc      proc     defaults        0 0
`),
		textFile('group', `root:x:0:
wheel:x:10:root,jnngl
users:x:100:jnngl
nobody:x:99:
`),
		textFile('hosts', `127.0.0.1 localhost.localdomain localhost
192.0.2.15 archbox.localdomain archbox
`),
		textFile('hostname', 'archbox\n'),
		textFile('inittab', `id:3:initdefault:

si::sysinit:/etc/rc.d/rc.sysinit
l3:3:wait:/etc/rc.d/rc 3
ca::ctrlaltdel:/sbin/shutdown -t3 -r now
1:2345:respawn:/sbin/agetty 38400 tty1 linux
2:2345:respawn:/sbin/agetty 38400 tty2 linux
`),
		textFile('issue', 'Arch Linux 0.1\\n\\l\n'),
		textFile('pacman.conf', `# Configuration for the pacman package manager
[options]
RootDir = /
DBPath = /var/lib/pacman/
CacheDir = /var/cache/pacman/pkg/

[current]
Server = ftp://mirror.example.net/arch/current
`),
		textFile('passwd', `root:x:0:0:root:/root:/bin/bash
jnngl:x:1000:100:Arch Linux User:/home/jnngl:/bin/bash
nobody:x:99:99:nobody:/:/bin/false
`),
		textFile('rc.conf', `HOSTNAME="archbox"
LOCALE="en_US"
TIMEZONE="US/Pacific"
KEYMAP="us"
USECOLOR="yes"
MODULES=()
DAEMONS=(syslogd network crond)
`),
		textFile('resolv.conf', `search localdomain
nameserver 192.0.2.53
`)
	]),
	directory('home', [
		directory('jnngl', [], [
			textFile('.bash_history', `cd /var/www
cat /var/log/boot.log
`),
			textFile('.bashrc', `export PS1='[\\u@\\h \\W]\\$ '
alias ll='ls -l'
`),
			textFile('.profile', `# User login settings
umask 022
`),
			textFile('README.txt', `Arch Linux work directory
-------------------------
Keep local notes and site files here.
`),
			textFile('todo.txt', `- check the mirror connection
- update the homepage
- ask about the old boot log
`)
		])
	]),
	directory('lib', [
		directory('modules', [
			directory('2.4.18', [
				directory('kernel', [
					directory('drivers', [
						directory('net', [], [textFile('eepro100.o', '[binary kernel module]\n')])
					])
				])
			])
		])
	], [
		textFile('ld-linux.so.2', '[ELF shared library loader]\n', '-rwxr-xr-x'),
		textFile('libc.so.6', '[GNU C library]\n', '-rwxr-xr-x')
	]),
	directory('mnt', [directory('cdrom')]),
	directory('proc', [], [
		textFile('cmdline', 'root=/dev/hda3 ro vga=normal\n'),
		textFile('cpuinfo', `processor       : 0
vendor_id       : GenuineIntel
cpu family      : 6
model           : 8
model name      : Intel(R) Pentium(R) III CPU
stepping        : 6
cpu MHz         : 800.000
cache size      : 256 KB
fpu             : yes
`),
		textFile('loadavg', '0.04 0.09 0.12 1/42 217\n'),
		textFile('meminfo', `        total:    used:    free:  shared: buffers:  cached:
Mem:   267386880 118423552 148963328        0  11010048  54525952
Swap:  134213632        0 134213632
MemTotal:       261120 kB
MemFree:        145472 kB
MemShared:           0 kB
Buffers:         10752 kB
Cached:          53248 kB
SwapCached:          0 kB
SwapTotal:      131068 kB
SwapFree:       131068 kB
`),
		textFile('uptime', '521.83 403.19\n'),
		textFile('version', 'Linux version 2.4.18 (build@archbox) (gcc version 2.95.3) #1 Sun Mar 10 22:40:00 PST 2002\n')
	]),
	directory('root', [], [
		textFile('.bash_history', `pwd
ls -a
cat /var/log/boot.log
cat /var/lib/pacman/local/arch-0.1-1/desc
`),
		textFile('.bashrc', `export PS1='[\\u@\\h \\W]\\$ '
alias ll='ls -l'
`),
		textFile('.profile', `# Root login settings
umask 022
`),
		textFile('README.txt', `archbox system notes
--------------------
Base system installed from Arch Linux 0.1 media.
See /var/log/boot.log for the last startup.
`)
	]),
	directory('sbin', [], [
		textFile('agetty', '', '-rwxr-xr-x'),
		textFile('ifconfig', '', '-rwxr-xr-x'),
		textFile('init', '', '-rwxr-xr-x'),
		textFile('mount', '', '-rwxr-xr-x'),
		textFile('reboot', '', '-rwxr-xr-x'),
		textFile('route', '', '-rwxr-xr-x'),
		textFile('shutdown', '', '-rwxr-xr-x'),
		textFile('swapon', '', '-rwxr-xr-x')
	]),
	directory('tmp', [], [textFile('.X0-lock', '37\n')]),
	directory('usr', [
		directory('bin', [], [
			...['bash', 'gcc', 'grep', 'gzip', 'man', 'make', 'ping', 'tar', 'vi', 'wget'].map((name) => textFile(name, '', '-rwxr-xr-x'))
		]),
		directory('share', [
			directory('man', [
				directory('man1', [], [textFile('bash.1.gz', '[compressed manual page]\n')])
			]),
			directory('zoneinfo', [
				directory('US', [], [textFile('Pacific', 'PST8PDT\n')])
			])
		]),
		directory('lib', [], [
			textFile('libncurses.so.5', '[shared library]\n', '-rwxr-xr-x'),
			textFile('libreadline.so.4', '[shared library]\n', '-rwxr-xr-x')
		])
	]),
	directory('var', [
		directory('cache', [
			directory('pacman', [
				directory('pkg', [], [
					textFile('bash-2.05b-1.pkg.tar.gz', '[compressed package archive]\n'),
					textFile('linux-2.4.18-1.pkg.tar.gz', '[compressed package archive]\n'),
					textFile('pacman-1.2.0-1.pkg.tar.gz', '[compressed package archive]\n')
				])
			])
		]),
		directory('lib', [
			directory('pacman', [
				directory('local', [
					packageDirectory('arch-0.1-1', 'arch', '0.1-1', 'Base installation files for Arch Linux.', '/etc/issue\n/etc/rc.conf\n/etc/rc.d/.zov\n'),
					packageDirectory('bash-2.05b-1', 'bash', '2.05b-1', 'The GNU Bourne Again shell.', '/bin/bash\n/usr/share/man/man1/bash.1.gz'),
					packageDirectory('glibc-2.2.5-1', 'glibc', '2.2.5-1', 'The GNU C library.', '/lib/libc.so.6'),
					packageDirectory('linux-2.4.18-1', 'linux', '2.4.18-1', 'The Linux kernel and modules.', '/boot/vmlinuz-linux'),
					packageDirectory('pacman-1.2.0-1', 'pacman', '1.2.0-1', 'The Arch Linux package manager.', '/bin/pacman\n/etc/pacman.conf')
				])
			])
		]),
		directory('log', [], [
			textFile('boot.log', `Mar 11 08:41:02 archbox init: version 2.84 booting
Mar 11 08:41:03 archbox kernel: Linux version 2.4.18
Mar 11 08:41:04 archbox kernel: Detected 800.000 MHz Pentium III processor
Mar 11 08:41:05 archbox kernel: 256 MB RAM available
Mar 11 08:41:11 archbox kernel: eth0: link up, 100 Mbps
Mar 11 08:41:15 archbox syslogd: started
Mar 11 08:41:18 archbox network: configured eth0 as 192.0.2.15
Mar 11 08:41:22 archbox init: entering runlevel 3
Mar 11 08:42:06 archbox login: root login on tty1
Mar 11 08:42:11 archbox init: startup complete
`),
			textFile('messages', `Mar 11 08:41:03 archbox kernel: Linux version 2.4.18
Mar 11 08:41:04 archbox kernel: ide0: hda: WDC AC28400L, ATA DISK drive
Mar 11 08:41:11 archbox kernel: eth0: Intel PRO/100 Ethernet interface
Mar 11 08:41:15 archbox syslogd: started
Mar 11 08:41:18 archbox network: eth0 configured, nameserver 192.0.2.53
Mar 11 08:42:06 archbox login: root login on tty1
`),
			textFile('pacman.log', `2002-03-11 08:36:14 [PACMAN] synchronizing package databases
2002-03-11 08:36:19 [PACMAN] installed arch (0.1-1)
2002-03-11 08:37:02 [PACMAN] installed bash (2.05b-1)
2002-03-11 08:38:44 [PACMAN] installed pacman (1.2.0-1)
2002-03-11 08:39:03 [PACMAN] transaction completed
`),
			textFile('XFree86.0.log', `XFree86 Version 4.2.0
Release Date: 23 January 2002
Build Operating System: Linux 2.4.18 i686
(--) PCI: Intel 82810E Graphics Controller
(**) FontPath set to "/usr/X11R6/lib/X11/fonts/misc"
(II) Screen initialized at 800x600, 60Hz
(II) Server terminated successfully (0). Closing log file.
`)
		]),
		directory('www')
	]),
];
