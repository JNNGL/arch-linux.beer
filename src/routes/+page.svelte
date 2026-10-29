<script lang="ts">
    import "@fontsource/jetbrains-mono";

    import {onMount} from "svelte";

    let innerWidth = $state(0);
    let innerHeight = $state(0);

    let rows = $state(0);
    let columns = $state(0);

    interface SymbolData {
        color: string;
        content: string;
    }

    let data: Array<Array<SymbolData>> = $state([]);

    let measurer: HTMLSpanElement;

    function renderGrid() {
        if (!measurer || innerWidth === 0 || innerHeight === 0) return;

        const rect = measurer.getBoundingClientRect();
        const charWidth = rect.width;
        const charHeight = rect.height;

        columns = Math.floor(innerWidth / charWidth);
        rows = Math.floor(innerHeight / charHeight);

        data = Array.from({length: rows});
        for (let i = 0; i < rows; i++) {
            data[i] = Array.from({length: columns});
            for (let j = 0; j < columns; j++) {
                data[i][j] = {color: "text-neutral-700", content: "#"};
            }
        }
    }

    onMount(() => {
        renderGrid();

        addEventListener("resize", renderGrid);

        return () => {
            removeEventListener("resize", renderGrid);
        }
    });
</script>

<svelte:window bind:innerWidth={innerWidth} bind:innerHeight={innerHeight} />

<span class="grid-item measure-box" bind:this={measurer}>&nbsp;</span>

<div class="fullscreen-grid justify-center bg-neutral-950 text-white">
    <!--{#each { length: rows }, r}-->
    <!--    <div class="grid-row justify-between">-->
    <!--        {#each { length: columns }, c}-->
    <!--            <span class="grid-item {data[r][c].color}">{data[r][c].content}</span>-->
    <!--        {/each}-->
    <!--    </div>-->
    <!--{/each}-->

    <h1 class="self-center text-4xl">I use arch btw</h1>
</div>

<style>
    :global(html, body) {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: "JetBrains Mono", monospace;
    }

    .fullscreen-grid {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: flex;
        flex-direction: column;
    }

    .grid-row {
        display: flex;
        flex-direction: row;
        white-space: nowrap;
    }

    .grid-item {
        font-size: 0.8rem;
        line-height: 1.4;
        display: inline-block;
    }

    .measure-box {
        position: absolute;
        visibility: hidden;
        pointer-events: none;
    }
</style>
