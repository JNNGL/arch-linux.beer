<script lang="ts">
    import "@fontsource/jetbrains-mono";

    import {onMount} from "svelte";
    import {expoOut} from "svelte/easing";

    let canvas: HTMLCanvasElement;
    let overlay: HTMLElement;

    let viewportWidth = $state(0);
    let viewportHeight = $state(0);

    let operatingSystem = $state("");
    let host = $state("");

    const fontSize = 12.8;
    const lineHeight = fontSize * 1.4;
    const maxCells = 12000;
    const colorLevels = 128;

    let gridStyle = $state("visibility: hidden;");
    let backgroundColor = $state("black");

    let frame = 0;
    let time = 0;
    let deltaTime = 0.0015;
    let powR = 2.0, powG = 1.0, powB = 0.5;
    let targetPowR = 2.0, targetPowG = 1.0, targetPowB = 0.5;

    const chars: string = "@B%8&WM#*oahkbdpqwmzcvunxrjft/|()1{}[]?-_+~<>i!;:,^`'. ";

    let colorPalette: Array<string> = [];

    let promptLine = "root@localhost:~# ";
    let commandLine = "";
    let terminalData: Array<string> = $state([promptLine]);
    let cursorX = $state(promptLine.length);

    function generatePalette() {
        colorPalette = Array.from({ length: colorLevels + 1 }, (_, index) => {
            const shade = index / colorLevels;
            const r = Math.pow(shade, powR) * 0.33;
            const g = Math.pow(shade, powG) * 0.33;
            const b = Math.pow(shade, powB) * 0.33;
            return `rgb(${r * 100}% ${g * 100}% ${b * 100}%)`;
        })
    }

    function backgroundOpacity(time: number): number {
        return time >= 1.0 ? 1.0 : expoOut(time);
    }

    const fract = (x: number): number => x - Math.floor(x);

    function rand(x: number, y: number): number {
        return fract(Math.sin(x * 12.9898 + y * 4.1414) * 43758.5453);
    }

    function noise(x: number, y: number): number {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        let u = fract(x);
        let v = fract(y);

        u = u * u * (3 - 2 * u);
        v = v * v * (3 - 2 * v);

        const a = rand(ix, iy);
        const b = rand(ix + 1, iy);
        const c = rand(ix, iy + 1);
        const d = rand(ix + 1, iy + 1);

        const lower = a * (1 - u) + b * u;
        const upper = c * (1 - u) + d * u;
        const result = lower * (1 - v) + upper * v;

        return result * result;
    }

    function fbm(x: number, y: number, iTime: number): number {
        let f = 0;
        let px = x;
        let py = y;
        const timeOffset = Math.sin(iTime);

        f += 0.5 * noise(px + iTime, py + iTime);
        let nextX = (0.8 * px - 0.6 * py) * 2.02;
        py = (0.6 * px + 0.8 * py) * 2.02;
        px = nextX;

        f += 0.03125 * noise(px, py);
        nextX = (0.8 * px - 0.6 * py) * 2.01;
        py = (0.6 * px + 0.8 * py) * 2.01;
        px = nextX;

        f += 0.25 * noise(px, py);
        nextX = (0.8 * px - 0.6 * py) * 2.03;
        py = (0.6 * px + 0.8 * py) * 2.03;
        px = nextX;

        f += 0.125 * noise(px, py);
        nextX = (0.8 * px - 0.6 * py) * 2.01;
        py = (0.6 * px + 0.8 * py) * 2.01;
        px = nextX;

        f += 0.0625 * noise(px, py);
        nextX = (0.8 * px - 0.6 * py) * 2.04;
        py = (0.6 * px + 0.8 * py) * 2.04;
        px = nextX;

        f += 0.015625 * noise(px + timeOffset, py + timeOffset);

        return f / 0.96875;
    }

    function pattern(x: number, y: number, iTime: number): number {
        const base = fbm(x, y, iTime);
        const warped = fbm(x + base, y + base, iTime);
        return fbm(x + warped, y + warped, iTime);
    }

    function mapChar(x: number): string {
        if (x <= 0.0) {
            return chars[chars.length - 1];
        } else if (x >= 1.0) {
            return chars[0];
        } else {
            let index = (1.0 - x) * (chars.length - 1);
            return chars[Math.round(index)];
        }
    }

    function renderGrid() {
        const ctx = canvas?.getContext("2d");
        if (!ctx) return;

        viewportWidth = window.innerWidth;
        viewportHeight = window.innerHeight;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width !== Math.round(width * dpr) ||
            canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }

        const opacity = backgroundOpacity(time);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        const charWidth = ctx.measureText("@").width;
        const baseColumns = Math.floor(width / charWidth);
        const baseRows = Math.floor(height / lineHeight);
        if (!baseColumns || !baseRows) return;

        const cellScale = Math.min(1, Math.sqrt(maxCells / (baseColumns * baseRows)));
        const columns = Math.max(1, Math.floor(baseColumns * cellScale));
        const rows = Math.max(1, Math.floor(baseRows * cellScale));
        const cellWidth = width / columns;
        const cellHeight = height / rows;
        const frameFontSize = fontSize / cellScale;
        ctx.font = `${frameFontSize}px "JetBrains Mono", monospace`;
        const frameCharWidth = ctx.measureText("@").width;

        const canvasRect = canvas.getBoundingClientRect();
        const rect = overlay.getBoundingClientRect();
        const viewportScaleX = canvasRect.width / width || 1;
        const viewportScaleY = canvasRect.height / height || 1;
        const localLeft = (rect.left - canvasRect.left) / viewportScaleX;
        const localTop = (rect.top - canvasRect.top) / viewportScaleY;

        const alignedX = Math.round(localLeft / cellWidth) * cellWidth;
        const alignedY = Math.round(localTop / cellHeight) * cellHeight;

        let metrics =
            `--grid-columns:${columns};` +
            `--grid-rows:${rows};` +
            `--grid-cell-width:${cellWidth}px;` +
            `--grid-cell-height:${cellHeight}px;` +
            `--grid-font-size:${frameFontSize}px;` +
            `--grid-letter-spacing:${cellWidth - frameCharWidth}px;` +
            `--overlay-translate-x:${localLeft - alignedX}px;` +
            `--overlay-translate-y:${localTop - alignedY}px;`;

        if (frame <= 1) {
            metrics += "visibility:hidden;";
        }

        if (gridStyle !== metrics) gridStyle = metrics;

        backgroundColor = `rgb(${opacity * 4}% ${opacity * 4}% ${opacity * 4}%)`;

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        const aspect = columns / rows;
        let currentColor = "";

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
                let u = 0.25 * aspect * j / columns;
                let v = i / rows;

                let shade = pattern(u, v, time);
                let shadeScaled = Math.min(1.0, shade * 1.5);

                shadeScaled *= opacity;

                const colorIndex = Math.round(shadeScaled * colorLevels);
                const color = colorPalette[colorIndex];
                if (color !== currentColor) {
                    ctx.fillStyle = color;
                    currentColor = color;
                }

                ctx.fillText(mapChar(shade + 0.5), (j + 0.5) * cellWidth, (i + 0.5) * cellHeight);
            }
        }
    }

    onMount(() => {
        generatePalette();

        let active = true;
        let frameId = 0;
        const visualViewport = window.visualViewport;

        import("svelte-system-info").then((System) => {
            type SvSystem = {
                readonly OSName: string;
                readonly OSVersion: string;
                readonly BrowserName: string;
                readonly BrowserVersion: string;
            };

            const info = System as unknown as SvSystem;

            operatingSystem = info.OSName + " " + info.OSVersion;
            host = info.BrowserName + " " + info.BrowserVersion;
        })

        const scheduleRender = () => {
            if (!active || frameId) return;
            frameId = requestAnimationFrame(() => {
                frameId = 0;
                renderGrid();
            });
        };

        const resizeObserver = new ResizeObserver(scheduleRender);
        resizeObserver.observe(canvas);

        const intervalId = setInterval(() => {
            if (!document.hidden) {
                frame++;
                time += deltaTime;
                generatePalette();

                const lerp = (a: number, b: number, t: number): number => {
                    return a + t * (b - a);
                };

                deltaTime = lerp(deltaTime, 0.0015, 0.1);
                powR = lerp(powR, targetPowR, 0.3);
                powG = lerp(powG, targetPowG, 0.3);
                powB = lerp(powB, targetPowB, 0.3);

                targetPowR = lerp(targetPowR, 2.0, 0.006);
                targetPowG = lerp(targetPowG, 1.0, 0.006);
                targetPowB = lerp(targetPowB, 0.5, 0.006);

                if (frame == 400) {
                    deltaTime = 0.04;
                    targetPowR = 0.4;
                    targetPowG = 1.5;
                    targetPowB = 2.0;
                    // targetPowR = 1.0;
                    // targetPowG = 0.5;
                    // targetPowB = 1.0;
                }

                scheduleRender();
            }
        }, 50);

        addEventListener("resize", scheduleRender);

        visualViewport?.addEventListener("resize", scheduleRender);
        visualViewport?.addEventListener("scroll", scheduleRender);

        scheduleRender();

        void document.fonts.ready.then(scheduleRender);

        return () => {
            active = false;
            if (frameId) cancelAnimationFrame(frameId);
            clearInterval(intervalId);
            resizeObserver.disconnect();
            removeEventListener("resize", scheduleRender);
            visualViewport?.removeEventListener("resize", scheduleRender);
            visualViewport?.removeEventListener("scroll", scheduleRender);
        }
    });

    let cursorSolid = $state(false);
    let cursorSolidTimer: ReturnType<typeof setTimeout> | undefined;

    function holdCursorSolid() {
        cursorSolid = true;
        clearTimeout(cursorSolidTimer);
        cursorSolidTimer = setTimeout(() => {
            cursorSolid = false;
        }, 450);
    }

    function onKeyDown(event: KeyboardEvent) {
        const control = event.ctrlKey;
        if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.length == 1) {
            holdCursorSolid();
            commandLine = commandLine.substring(0, cursorX - promptLine.length) + event.key + commandLine.substring(cursorX - promptLine.length);
            terminalData[terminalData.length - 1] = promptLine + commandLine;
            cursorX++;
        } else if (event.key === "Backspace") {
            holdCursorSolid();
            if (cursorX > promptLine.length) {
                commandLine = commandLine.substring(0, cursorX - promptLine.length - 1) + commandLine.substring(cursorX - promptLine.length);
                terminalData[terminalData.length - 1] = promptLine + commandLine;
                cursorX--;
            }
        } else if (event.key === "ArrowLeft") {
            holdCursorSolid();
            if (cursorX > promptLine.length) {
                cursorX--;
            }
        } else if (event.key === "ArrowRight") {
            holdCursorSolid();
            if (cursorX < promptLine.length + commandLine.length) {
                cursorX++;
            }
        } else if (control && event.key === "c") {
            commandLine = "";
            terminalData[terminalData.length - 1] += "^C";
            terminalData.push(promptLine);
        }
    }
</script>

<svelte:window on:keydown|preventDefault={onKeyDown} />

<canvas bind:this={canvas} class="fullscreen-grid" aria-hidden="true"></canvas>

<div class="overlay" style={gridStyle}>
    <section bind:this={overlay} class="overlay-block">
        <div class="aligned-content">
            <div style="gap: var(--grid-cell-width);" class="flex flex-row flex-wrap">
                <div style="--reveal-delay:40" class="text-blue-300">
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-`</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.o+`</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`ooo/</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`+oooo:</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`+oooooo:</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-+oooooo+:</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`/:-:++oooo+:</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`/++++/+++++++:</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`/++++++++++++++:</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`/+++ooooooooooooo/`</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;./ooosssso++osssssso+`</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.oossssso-````/ossssss+`</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-osssssso.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:ssssssso.</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:osssssss/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;osssso+++.</p>
                    <p>&nbsp;&nbsp;&nbsp;&nbsp;/ossssssss/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ssssooo/-</p>
                    <p>&nbsp;&nbsp;`/ossssso+/:-&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-:/+osssso+-</p>
                    <p>&nbsp;`+sso+:-`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`.-/+oso:</p>
                    <p>`++:.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`-/+/</p>
                    <p>.`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`/</p>
                </div>
                <div>
                    <p style="--reveal-delay:10"><span class="text-blue-300">root</span>@<span class="text-blue-300">arch-linux.beer</span></p>
                    <p style="--reveal-delay:10">--------------------</p>
                    <p style="--reveal-delay:11"><span class="text-blue-300">OS</span>: {operatingSystem}</p>
                    <p style="--reveal-delay:12"><span class="text-blue-300">Host</span>: {host}</p>
                    <p style="--reveal-delay:16"><span class="text-blue-300">Packages</span>: 23 (npm)</p>
                    <p style="--reveal-delay:19"><span class="text-blue-300">Resolution</span>: {viewportWidth}x{viewportHeight}</p>
                    <p style="--reveal-delay:20"><span class="text-blue-300">Font</span>: JetBrains Mono</p>
                    <p></p>
                    <p style="--reveal-delay:22" class="text-blue-300">Links</p>
                    <p style="--reveal-delay:22">-----</p>
                    <p style="--reveal-delay:23"><span class="text-blue-300">GitHub</span>: https://github.com/JNNGL</p>
                    <p style="--reveal-delay:24"><span class="text-blue-300">Telegram</span>: https://t.me/jnngles</p>
                    <p style="--reveal-delay:25"><span class="text-blue-300">Email</span>: jnngl@arch-linux.beer</p>
                    <p></p>
                    <div style="--reveal-delay:30">
                        <div class="flex flex-row"><p class="bg-neutral-600">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-red-400">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-emerald-400">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-yellow-300">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-blue-400">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-fuchsia-400">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-cyan-300">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-neutral-200">&nbsp;&nbsp;&nbsp;&nbsp;</p></div>
                        <div class="flex flex-row"><p class="bg-neutral-400">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-red-300">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-emerald-200">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-yellow-200">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-blue-300">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-fuchsia-300">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-cyan-200">&nbsp;&nbsp;&nbsp;&nbsp;</p><p class="bg-white">&nbsp;&nbsp;&nbsp;&nbsp;</p></div>
                    </div>
                </div>
            </div>
            <div style="--reveal-delay:45; padding: 0 var(--grid-cell-width); margin: var(--grid-cell-height) 0;"
                 class="flex flex-row grow justify-between bg-emerald-400 text-neutral-950">
                <p>!/bin/sh</p>
                <p>[running]</p>
            </div>
            <div style="--reveal-delay:50" class="whitespace-pre terminal">
                {#each terminalData as line, index (index)}
                    {#if index === terminalData.length - 1}
                        <div class="flex flex-row">
                            <p>{line.substring(0, cursorX)}</p>
                            <p class:solid={cursorSolid} class="terminal-cursor">{cursorX < line.length ? line[cursorX] : " "}</p>
                            <p>{line.substring(cursorX + 1)}</p>
                        </div>
                    {:else}
                        <p>{line}</p>
                    {/if}
                {/each}
            </div>
        </div>
    </section>
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

    .overlay {
        position: fixed;
        inset: 0;
        z-index: 1;
        display: grid;
    }

    @keyframes cursor-blink {
        0%, 49.9% {
            background-color: white;
            color: black;
        }

        50%, 100% {
            background-color: transparent;
            color: inherit;
        }
    }

    .overlay-block {
        place-self: center;
        margin: 0;
        color: white;
        font-size: var(--grid-font-size);
        line-height: var(--grid-cell-height);
        letter-spacing: var(--grid-letter-spacing);
        font-variant-ligatures: none;
        text-align: start;
    }

    .aligned-content {
        padding: var(--grid-cell-height) calc(var(--grid-cell-width) * 2);
        border-radius: 5px;
        background-color: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(20px);
        transform: translateX(var(--overlay-translate-x)) translateY(var(--overlay-translate-y));
    }

    .aligned-content .terminal *:not(.terminal-cursor) {
        animation: none;
        opacity: 1;
    }

    .aligned-content .terminal p.terminal-cursor {
        animation: cursor-blink 1s steps(1, end) infinite;
    }

    .aligned-content .terminal p.terminal-cursor.solid {
        animation: none;
        background: white;
        color: black;
    }

    .aligned-content p:not(.terminal-cursor),
    /*.aligned-content h1,*/
    .aligned-content span,
    .aligned-content div {
        min-height: var(--grid-cell-height);
        padding: 0;

        opacity: 0;
        animation: reveal 150ms ease both;
        animation-delay: calc(500ms + var(--reveal-delay, 0) * 35ms);
    }

    @keyframes reveal {
        from {
            transform: translateX(-3px);
        }
        to {
            opacity: 1;
        }
    }

    .fullscreen-grid {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: block;
        z-index: 0;
    }
</style>
