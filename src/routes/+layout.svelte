<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/arch-linux-icon.png';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>arch-linux.beer</title>
	<link rel="icon" type="image/png" href={favicon} />
</svelte:head>

{@render children()}
