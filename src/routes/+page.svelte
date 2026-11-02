<script lang="ts">
    import "@fontsource/jetbrains-mono";

    import {onMount} from "svelte";
    import {expoOut} from "svelte/easing";

    import {processCommand} from "#lib/command.ts";
    import type {OutputPipe} from "#lib/pipe.ts";
    import {wrapTerminalItems} from "#lib/terminal.ts";
    import {
        getCommandCompletions,
        getDisplayCWD,
        getPathCompletions,
        loadStaticWebFiles,
        type CompletionCandidate
    } from "#lib/filesystem.ts";
    import {
        colorLevels, colorPalette,
        frame, generatePalette,
        gTargetLevel, setErrorBackground,
        tickBackground,
        time
    } from "#lib/background.svelte.ts";

    let canvas: HTMLCanvasElement;
    let overlay: HTMLElement;
    let alignedContent: HTMLDivElement;
    let zfetchPanel: HTMLDivElement;
    let terminalPanel: HTMLDivElement;
    let terminalElement: HTMLDivElement;

    let viewportWidth = $state(0);
    let viewportHeight = $state(0);
    let overlayOverflow = $state(false);
    let activeOverlayTab = $state<"zfetch" | "terminal">("zfetch");
    let initialOverlayMeasurementDone = false;
    let animateInitialOverlayTabs = false;

    let operatingSystem = $state("");
    let host = $state("");

    const fontSize = 12.8;
    const lineHeight = fontSize * 1.4;
    const maxCells = 12000;

    let gridStyle = $state("visibility: hidden;");
    let backgroundColor = $state("black");

    const chars: string = "@B%8&WM#*oahkbdpqwmzcvunxrjft/|()1{}[]?-_+~<>i!;:,^`'. ";

    function getPromptLine(): string {
        return (gTargetLevel.value <= 0.5 ? "root@localhost:" : "goyda@localhost:") + getDisplayCWD() + "# ";
    }

    let promptLine = getPromptLine();
    let commandLine = "";
    let commandHistory: string[] = [];
    let commandHistoryIndex = -1;
    let commandHistoryDraft = "";
    let terminalData: Array<string> = $state([promptLine]);
    let cursorX = $state(promptLine.length);
    let terminalRows = $state(12);
    let terminalColumns = $state(80);
    const terminalWheelCooldown = 400;
    let terminalFirstRow = $state(0);
    let terminalFollowsOutput = $state(true);
    type TerminalDisplayLine = { line: string; index: number; slot: number; cursorOffset: number | null };
    function buildTerminalDisplayLines(columns: number): TerminalDisplayLine[] {
        const safeColumns = Math.max(1, columns);
        const displayLines: TerminalDisplayLine[] = [];
        const lastIndex = terminalData.length - 1;

        for (let index = 0; index < terminalData.length; index++) {
            const line = terminalData[index];
            const cursorPosition = index === lastIndex ? Math.min(cursorX, line.length) : -1;
            const cursorNeedsExtraRow =
                cursorPosition === line.length && line.length > 0 && line.length % safeColumns === 0;
            const rowCount = Math.max(1, Math.ceil(line.length / safeColumns)) + Number(cursorNeedsExtraRow);
            const cursorRow = cursorPosition >= 0 ? Math.floor(cursorPosition / safeColumns) : -1;

            for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
                const start = rowIndex * safeColumns;
                const end = Math.min(start + safeColumns, line.length);
                displayLines.push({
                    line: line.slice(start, end),
                    index,
                    slot: displayLines.length,
                    cursorOffset: rowIndex === cursorRow ? cursorPosition - start : null
                });
            }
        }

        return displayLines;
    }

    let terminalDisplayLines = $derived.by(() => buildTerminalDisplayLines(terminalColumns));
    let visibleTerminalLines = $derived(
        terminalDisplayLines.slice(terminalFirstRow, terminalFirstRow + terminalRows)
    );
    let terminalScrollbarThumbSize = $derived(
        Math.min(terminalRows, Math.max(1, Math.floor((terminalRows * terminalRows) / terminalDisplayLines.length)))
    );
    let terminalScrollbarThumbStart = $derived(
        Math.round(
            (terminalFirstRow / Math.max(1, terminalDisplayLines.length - terminalRows)) *
            (terminalRows - terminalScrollbarThumbSize)
        )
    );
    let terminalScrollbarRows = $derived(
        Array.from({ length: terminalRows }, (_, index) =>
            index >= terminalScrollbarThumbStart && index < terminalScrollbarThumbStart + terminalScrollbarThumbSize
        )
    );
    let terminalWheelRemainder = 0;
    let terminalWheelDirection = 0;
    let terminalWheelLastAt = 0;
    let terminalWheelIgnoreUntil = 0;

    function measureTerminalColumns() {
        if (!alignedContent || !terminalElement) return;

        const cellWidth = parseFloat(getComputedStyle(alignedContent).getPropertyValue("--grid-cell-width"));
        if (!Number.isFinite(cellWidth) || cellWidth <= 0) return;

        const columns = Math.max(1, Math.floor(terminalElement.getBoundingClientRect().width / cellWidth));
        if (columns === terminalColumns) return;

        terminalColumns = columns;
        const maxFirstRow = Math.max(0, buildTerminalDisplayLines(columns).length - terminalRows);
        terminalFirstRow = terminalFollowsOutput ? maxFirstRow : Math.min(terminalFirstRow, maxFirstRow);
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

    function measureOverlayOverflow() {
        if (!alignedContent || !zfetchPanel || !terminalPanel) return;
        if (!initialOverlayMeasurementDone && document.fonts.status === "loading") return;

        const style = getComputedStyle(alignedContent);
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const cellHeight = parseFloat(style.getPropertyValue("--grid-cell-height"));
        if (!Number.isFinite(cellHeight)) return;

        const panelsHeight = zfetchPanel.getBoundingClientRect().height + terminalPanel.getBoundingClientRect().height;
        const panelsHeightAtTwelveRows =
            panelsHeight - Math.max(0, terminalRows - 12) * cellHeight + (overlayOverflow ? cellHeight : 0);
        const availableHeight = window.visualViewport?.height ?? window.innerHeight;
        const shouldUseTabs = panelsHeightAtTwelveRows + padding > availableHeight + 1;

        if (!initialOverlayMeasurementDone) {
            animateInitialOverlayTabs = shouldUseTabs;
            initialOverlayMeasurementDone = true;
        }

        if (shouldUseTabs && !overlayOverflow) activeOverlayTab = "zfetch";
        overlayOverflow = shouldUseTabs;

        if (terminalRows !== (shouldUseTabs ? 18 : 12)) {
            terminalRows = shouldUseTabs ? 18 : 12;
            const maxFirstRow = Math.max(0, buildTerminalDisplayLines(terminalColumns).length - terminalRows);
            terminalFirstRow = terminalFollowsOutput ? maxFirstRow : Math.min(terminalFirstRow, maxFirstRow);
        }
    }

    function animateInitialTabs(node: HTMLElement) {
        if (!animateInitialOverlayTabs) return;

        animateInitialOverlayTabs = false;
        const delay = 2050;
        node.inert = true;
        node.style.pointerEvents = "none";
        const enableTabs = setTimeout(() => {
            node.inert = false;
            node.style.removeProperty("pointer-events");
        }, delay);

        const animation = node.animate(
            [
                { opacity: 0, transform: "translateX(-3px)" },
                { opacity: 1, transform: "translateX(0)" }
            ],
            { duration: 150, easing: "ease", delay, fill: "backwards" }
        );

        return {
            destroy() {
                clearTimeout(enableTabs);
                animation.cancel();
            }
        };
    }

    onMount(() => {
        generatePalette();

        loadStaticWebFiles();

        let active = true;
        let frameId = 0;
        let overlayMeasureFrame = 0;
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

        const scheduleOverlayMeasure = () => {
            if (!active || overlayMeasureFrame) return;
            overlayMeasureFrame = requestAnimationFrame(() => {
                overlayMeasureFrame = 0;
                measureTerminalColumns();
                measureOverlayOverflow();
            });
        };

        const resizeObserver = new ResizeObserver(scheduleRender);
        resizeObserver.observe(canvas);
        const overlayResizeObserver = new ResizeObserver(scheduleOverlayMeasure);
        overlayResizeObserver.observe(alignedContent);
        overlayResizeObserver.observe(zfetchPanel);
        overlayResizeObserver.observe(terminalPanel);
        overlayResizeObserver.observe(terminalElement);

        const intervalId = setInterval(() => {
            if (!document.hidden) {
                tickBackground();
                scheduleRender();
            }
        }, 50);

        addEventListener("resize", scheduleRender);
        addEventListener("resize", scheduleOverlayMeasure);

        visualViewport?.addEventListener("resize", scheduleRender);
        visualViewport?.addEventListener("scroll", scheduleRender);
        visualViewport?.addEventListener("resize", scheduleOverlayMeasure);
        visualViewport?.addEventListener("scroll", scheduleOverlayMeasure);

        scheduleRender();
        scheduleOverlayMeasure();

        void document.fonts.ready.then(() => {
            scheduleRender();
            scheduleOverlayMeasure();
        });

        return () => {
            active = false;
            if (frameId) cancelAnimationFrame(frameId);
            if (overlayMeasureFrame) cancelAnimationFrame(overlayMeasureFrame);
            clearInterval(intervalId);
            resizeObserver.disconnect();
            overlayResizeObserver.disconnect();
            removeEventListener("resize", scheduleRender);
            removeEventListener("resize", scheduleOverlayMeasure);
            visualViewport?.removeEventListener("resize", scheduleRender);
            visualViewport?.removeEventListener("scroll", scheduleRender);
            visualViewport?.removeEventListener("resize", scheduleOverlayMeasure);
            visualViewport?.removeEventListener("scroll", scheduleOverlayMeasure);
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

    const terminalOutputPipe: OutputPipe = (data: string) => {
        const parts = data.split("\n");
        terminalData[terminalData.length - 1] += parts[0];
        for (let i = 1; i < parts.length; i++) {
            terminalData.push(parts[i]);
        }
        if (terminalFollowsOutput) {
            terminalFirstRow = Math.max(0, buildTerminalDisplayLines(terminalColumns).length - terminalRows);
            resetTerminalWheelMotion();
        }
    };
    terminalOutputPipe.clearTerminal = () => {
        terminalData = [];
        terminalFirstRow = 0;
        terminalFollowsOutput = true;
    };
    terminalOutputPipe.getTerminalColumns = () => terminalColumns;

    function resetTerminalWheelMotion() {
        terminalWheelRemainder = 0;
        terminalWheelDirection = 0;
        terminalWheelLastAt = 0;
        terminalWheelIgnoreUntil = performance.now() + terminalWheelCooldown;
    }

    function onTerminalWheel(event: WheelEvent) {
        if (event.deltaY === 0) return;

        event.preventDefault();
        if (performance.now() < terminalWheelIgnoreUntil) return;

        const terminal = event.currentTarget as HTMLElement;
        const rowHeight = parseFloat(getComputedStyle(terminal).lineHeight);
        if (!Number.isFinite(rowHeight) || rowHeight <= 0) return;

        let delta = event.deltaY;
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
            delta *= rowHeight;
        } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
            delta *= terminal.clientHeight;
        }

        const now = event.timeStamp;
        if (now - terminalWheelLastAt >= 120) {
            terminalWheelDirection = 0;
            terminalWheelRemainder = 0;
        }

        const eventDirection = Math.sign(delta);
        if (terminalWheelDirection && eventDirection !== terminalWheelDirection) return;

        terminalWheelDirection = eventDirection;
        terminalWheelLastAt = now;
        terminalWheelRemainder += delta;
        if (Math.abs(terminalWheelRemainder) < rowHeight) return;

        const direction = Math.sign(terminalWheelRemainder);
        terminalWheelRemainder = 0;

        const maxFirstRow = Math.max(0, buildTerminalDisplayLines(terminalColumns).length - terminalRows);
        terminalFirstRow = Math.max(0, Math.min(maxFirstRow, terminalFirstRow + direction));
        terminalFollowsOutput = terminalFirstRow === maxFirstRow;
    }

    function showTerminalTail() {
        terminalFirstRow = Math.max(0, buildTerminalDisplayLines(terminalColumns).length - terminalRows);
        terminalFollowsOutput = true;
        resetTerminalWheelMotion();
    }

    function decodeShellToken(token: string): string {
        let value = "";
        let escaped = false;

        for (const character of token) {
            if (escaped) {
                value += character;
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === '"') {
                continue;
            } else {
                value += character;
            }
        }

        if (escaped) value += "\\";
        return value;
    }

    function getCompletionContext(command: string, cursor: number) {
        const tokens: Array<{ start: number; end: number; value: string }> = [];
        let tokenStart = -1;
        let quoted = false;
        let escaped = false;

        for (let index = 0; index <= command.length; index++) {
            const character = command[index];
            if (index === command.length || (character === " " && !quoted && !escaped)) {
                if (tokenStart !== -1) {
                    tokens.push({
                        start: tokenStart,
                        end: index,
                        value: decodeShellToken(command.slice(tokenStart, index))
                    });
                }
                tokenStart = -1;
                escaped = false;
                continue;
            }

            if (tokenStart === -1) tokenStart = index;
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === '"') {
                quoted = !quoted;
            }
        }

        const boundedCursor = Math.max(0, Math.min(command.length, cursor));
        let tokenIndex = tokens.findIndex((token) => boundedCursor >= token.start && boundedCursor <= token.end);
        if (tokenIndex === -1) {
            tokenIndex = tokens.filter((token) => token.end < boundedCursor).length;
        }

        const token = tokens[tokenIndex];
        const start = token?.start ?? boundedCursor;
        const end = token?.end ?? boundedCursor;
        let quoteOpen = false;
        let escapeOpen = false;
        for (let index = start; index < boundedCursor; index++) {
            const character = command[index];
            if (escapeOpen) {
                escapeOpen = false;
            } else if (character === "\\") {
                escapeOpen = true;
            } else if (character === '"') {
                quoteOpen = !quoteOpen;
            }
        }

        return {
            tokenStart: start,
            tokenEnd: end,
            tokenIndex,
            rawPrefix: command.slice(start, boundedCursor),
            quoteOpen,
            completedTokens: tokens.slice(0, tokenIndex).map((completed) => completed.value)
        };
    }

    function encodeShellCompletion(value: string, quoted: boolean, keepQuoteOpen: boolean): string {
        if (quoted || /\s/.test(value)) {
            const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            return `"${escaped}${keepQuoteOpen ? "" : '"'}`;
        }
        return value.replace(/[\\ "]/g, "\\$&");
    }

    function completeTerminalToken() {
        const commandCursor = cursorX - promptLine.length;
        const context = getCompletionContext(commandLine, commandCursor);
        const prefix = decodeShellToken(context.rawPrefix);
        let candidates: CompletionCandidate[];

        if (context.tokenIndex === 0 && !prefix.includes("/")) {
            candidates = getCommandCompletions(prefix);
        } else {
            candidates = getPathCompletions(prefix);
            if (context.tokenIndex === 0) {
                candidates = candidates.filter((candidate) => candidate.isDirectory || candidate.executable);
            } else if (context.completedTokens[0] === "cd") {
                candidates = candidates.filter((candidate) => candidate.isDirectory);
            }
        }

        if (candidates.length === 0) return;

        const commonPrefix = candidates.reduce((common, candidate) => {
            while (!candidate.value.startsWith(common)) common = common.slice(0, -1);
            return common;
        }, candidates[0].value);

        if (candidates.length > 1 && commonPrefix === prefix) {
            const currentLine = promptLine + commandLine;
            terminalData[terminalData.length - 1] = currentLine;
            terminalData.push(...wrapTerminalItems(candidates.map((candidate) => candidate.label), terminalColumns));
            terminalData.push(currentLine);
            cursorX = promptLine.length + commandCursor;
            holdCursorSolid();
            showTerminalTail();
            return;
        }

        const singleCandidate = candidates.length === 1 ? candidates[0] : null;
        const completion = singleCandidate?.value ?? commonPrefix;
        const suffix = singleCandidate && !singleCandidate.isDirectory && context.tokenEnd === commandLine.length ? " " : "";
        const keepQuoteOpen = !singleCandidate && context.quoteOpen && commandCursor === context.tokenEnd;
        const replacement = encodeShellCompletion(
            completion,
            context.rawPrefix.includes('"') || /\s/.test(completion),
            keepQuoteOpen
        ) + suffix;
        commandLine = commandLine.slice(0, context.tokenStart) + replacement + commandLine.slice(context.tokenEnd);
        cursorX = promptLine.length + context.tokenStart + replacement.length;
        terminalData[terminalData.length - 1] = promptLine + commandLine;
        holdCursorSolid();
        showTerminalTail();
    }

    function moveCursorByWord(direction: -1 | 1) {
        let position = cursorX - promptLine.length;

        if (direction < 0) {
            while (position > 0 && /\s/.test(commandLine[position - 1])) position--;
            while (position > 0 && !/\s/.test(commandLine[position - 1])) position--;
        } else {
            while (position < commandLine.length && /\s/.test(commandLine[position])) position++;
            while (position < commandLine.length && !/\s/.test(commandLine[position])) position++;
        }

        cursorX = promptLine.length + position;
    }

    function navigateCommandHistory(direction: -1 | 1) {
        if (commandHistory.length === 0) return;

        if (direction < 0) {
            if (commandHistoryIndex === -1) {
                commandHistoryDraft = commandLine;
                commandHistoryIndex = commandHistory.length;
            }
            commandHistoryIndex = Math.max(0, commandHistoryIndex - 1);
            commandLine = commandHistory[commandHistoryIndex] ?? "";
        } else {
            if (commandHistoryIndex === -1) return;
            commandHistoryIndex++;
            if (commandHistoryIndex >= commandHistory.length) {
                commandHistoryIndex = -1;
                commandLine = commandHistoryDraft;
                commandHistoryDraft = "";
            } else {
                commandLine = commandHistory[commandHistoryIndex] ?? "";
            }
        }

        terminalData[terminalData.length - 1] = promptLine + commandLine;
        cursorX = promptLine.length + commandLine.length;
        holdCursorSolid();
        showTerminalTail();
    }

    function onKeyDown(event: KeyboardEvent) {
        const control = event.ctrlKey;
        const alt = event.altKey;
        const regular = !event.altKey && !event.ctrlKey && !event.metaKey;
        if (overlayOverflow && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
            const tabs = ["zfetch", "terminal"] as const;
            const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
            const currentIndex = tabs.indexOf(activeOverlayTab);
            activeOverlayTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
        } else if (overlayOverflow && activeOverlayTab !== "terminal") {
            return;
        } else if (regular && !event.shiftKey && event.key === "Tab") {
            completeTerminalToken();
        } else if (regular && event.key.length == 1) {
            holdCursorSolid();
            commandLine = commandLine.substring(0, cursorX - promptLine.length) + event.key + commandLine.substring(cursorX - promptLine.length);
            terminalData[terminalData.length - 1] = promptLine + commandLine;
            cursorX++;
            showTerminalTail();
        } else if (event.key === "Backspace") {
            holdCursorSolid();
            if (cursorX > promptLine.length) {
                commandLine = commandLine.substring(0, cursorX - promptLine.length - 1) + commandLine.substring(cursorX - promptLine.length);
                terminalData[terminalData.length - 1] = promptLine + commandLine;
                cursorX--;
                showTerminalTail();
            }
        } else if ((regular || alt) && event.key === "ArrowLeft") {
            holdCursorSolid();
            if (cursorX > promptLine.length) {
                if (event.altKey) {
                    moveCursorByWord(-1);
                } else {
                    cursorX--;
                }
                showTerminalTail();
            }
        } else if ((regular || alt) && event.key === "ArrowRight") {
            holdCursorSolid();
            if (cursorX < promptLine.length + commandLine.length) {
                if (event.altKey) {
                    moveCursorByWord(1);
                } else {
                    cursorX++;
                }
                showTerminalTail();
            }
        } else if (regular && event.key === "ArrowUp") {
            navigateCommandHistory(-1);
        } else if (regular && event.key === "ArrowDown") {
            navigateCommandHistory(1);
        } else if (control && event.key === "c") {
            commandLine = "";
            commandHistoryIndex = -1;
            commandHistoryDraft = "";
            terminalData[terminalData.length - 1] += "^C";
            terminalData.push(promptLine);
            cursorX = promptLine.length;
            showTerminalTail();
        } else if (event.key === "Enter") {
            terminalData.push("");
            if (commandLine.trim().length > 0) {
                commandHistory.push(commandLine);
                commandHistoryIndex = -1;
                commandHistoryDraft = "";
                const code = processCommand(commandLine, terminalOutputPipe);
                if (code < 0) {
                    setErrorBackground();
                }
            } else {
                commandHistoryIndex = -1;
                commandHistoryDraft = "";
            }
            promptLine = getPromptLine();
            commandLine = "";
            if (terminalData[terminalData.length - 1] == "") {
                terminalData.pop();
            }
            terminalData.push(promptLine);
            cursorX = promptLine.length;
            showTerminalTail();
        }
    }
</script>

<svelte:window on:keydown|preventDefault={onKeyDown} />

<canvas bind:this={canvas} class="fullscreen-grid" aria-hidden="true"></canvas>

<div class="overlay" style={gridStyle}>
    <section bind:this={overlay} class="overlay-block">
        <div bind:this={alignedContent} class:overlay-overflow={overlayOverflow} class="aligned-content">
            {#if overlayOverflow}
                <div
                    use:animateInitialTabs
                    class="overlay-tabs"
                    role="tablist"
                    aria-label="Overlay views"
                >
                    <button
                        type="button"
                        role="tab"
                        id="overlay-tab-zfetch"
                        aria-controls="overlay-panel-zfetch"
                        aria-selected={activeOverlayTab === "zfetch"}
                        tabindex={activeOverlayTab === "zfetch" ? 0 : -1}
                        class:active={activeOverlayTab === "zfetch"}
                        class="overlay-tab"
                        on:click={() => activeOverlayTab = "zfetch"}
                    >&nbsp;zfetch</button>
                    <button
                        type="button"
                        role="tab"
                        id="overlay-tab-terminal"
                        aria-controls="overlay-panel-terminal"
                        aria-selected={activeOverlayTab === "terminal"}
                        tabindex={activeOverlayTab === "terminal" ? 0 : -1}
                        class:active={activeOverlayTab === "terminal"}
                        class="overlay-tab"
                        on:click={() => activeOverlayTab = "terminal"}
                    >terminal</button>
                </div>
            {/if}
            <div class="overlay-panels">
                <div
                    bind:this={zfetchPanel}
                    class:overlay-panel-inactive={overlayOverflow && activeOverlayTab !== "zfetch"}
                    class="overlay-panel zfetch-panel"
                    id="overlay-panel-zfetch"
                    role={overlayOverflow ? "tabpanel" : undefined}
                    aria-labelledby={overlayOverflow ? "overlay-tab-zfetch" : undefined}
                    aria-hidden={overlayOverflow && activeOverlayTab !== "zfetch"}
                    inert={overlayOverflow && activeOverlayTab !== "zfetch"}
                >
                    <div style="row-gap: var(--grid-cell-height); column-gap: var(--grid-cell-width);" class="flex flex-row flex-wrap">
                        {#if gTargetLevel.value <= 0.5}
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
                        {:else}
                            <div style="--reveal-delay:40" class="text-purple-600">
                                <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;###########&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;###################&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;##*******################&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;&nbsp;&nbsp;****+++**####################&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;&nbsp;**++=+**#######################&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;**+==+*######&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;############&nbsp;&nbsp;</p>
                                <p>&nbsp;**++++*****&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;###########&nbsp;</p>
                                <p>**++++*****&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;#########&nbsp;</p>
                                <p>+++++*****&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;##########</p>
                                <p>++++++**++&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;#########</p>
                                <p>+++++++++&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;#####**###</p>
                                <p>++++++++++&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;#####***###</p>
                                <p>&nbsp;+++==++++&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*####****##&nbsp;</p>
                                <p>&nbsp;+++===++++&nbsp;++++&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*****##**++*##&nbsp;&nbsp;</p>
                                <p>&nbsp;+++++==++++++++++**********+++**#&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;++++++++++++++**********+++**##&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;++++++++++++++++*****++++****&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;&nbsp;++++++++++++++++++++*****&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                <p>&nbsp;&nbsp;&nbsp;+++++&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;++++******</p>
                            </div>
                            <div>
                                <p style="--reveal-delay:10"><span class="text-fuchsia-300">goyda</span>@<span class="text-fuchsia-300">arch-linux.рф</span></p>
                                <p style="--reveal-delay:10">-------------------</p>
                                <p style="--reveal-delay:11"><span class="text-fuchsia-300">ОС</span>: Astra Linux</p>
                                <p style="--reveal-delay:12"><span class="text-fuchsia-300">Хост</span>: Яндекс.Браузер</p>
                                <p style="--reveal-delay:16"><span class="text-fuchsia-300">Модули</span>: 23 (1С)</p>
                                <p style="--reveal-delay:19"><span class="text-fuchsia-300">Разрешение</span>: {viewportWidth}x{viewportHeight}</p>
                                <p style="--reveal-delay:20"><span class="text-fuchsia-300">Шрифт</span>: JetBrains Mono</p>
                                <p></p>
                                <p style="--reveal-delay:22" class="text-fuchsia-300">Ссылки</p>
                                <p style="--reveal-delay:22">------</p>
                                <p style="--reveal-delay:23"><span class="text-fuchsia-300">MAX</span>: https://max.ru/u/f9L...vPk</p>
                                <p style="--reveal-delay:24"><span class="text-fuchsia-300">VK</span>: https://vk.ru/jnngles</p>
                                <p style="--reveal-delay:25"><span class="text-fuchsia-300">Почта</span>: jnngles@yandex.ru</p>
                                <p></p>
                                <div style="--reveal-delay:30">
                                    <p class="bg-white">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                    <p class="bg-blue-500">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                    <p class="bg-red-600">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
                <div
                    bind:this={terminalPanel}
                    class:overlay-panel-inactive={overlayOverflow && activeOverlayTab !== "terminal"}
                    class="overlay-panel terminal-panel"
                    id="overlay-panel-terminal"
                    role={overlayOverflow ? "tabpanel" : undefined}
                    aria-labelledby={overlayOverflow ? "overlay-tab-terminal" : undefined}
                    aria-hidden={overlayOverflow && activeOverlayTab !== "terminal"}
                    inert={overlayOverflow && activeOverlayTab !== "terminal"}
                >
                    <div style="--reveal-delay:45; padding: 0 var(--grid-cell-width);"
                 class="terminal-header flex flex-row grow justify-between bg-emerald-400 text-neutral-950">
                <p>{gTargetLevel.value <= 0.5 ? "!/bin/sh" : "!/bin/zov"}</p>
                <p>{gTargetLevel.value <= 0.5 ? "[running]" : "[запущен]"}</p>
            </div>
            <div style={`--reveal-delay:50; --terminal-rows:${terminalRows}`} class="terminal-layout" on:wheel|nonpassive={onTerminalWheel}>
                <div bind:this={terminalElement} class="terminal">
                    {#each visibleTerminalLines as row (row.slot)}
                        <div class="terminal-line flex flex-row">
                            {#if row.cursorOffset !== null}
                                <p>{row.line.substring(0, row.cursorOffset)}</p><p class:solid={cursorSolid} class="terminal-cursor">{row.cursorOffset < row.line.length ? row.line[row.cursorOffset] : " "}</p><p>{row.line.substring(row.cursorOffset + 1)}</p>
                            {:else}
                                <p>{row.line}</p>
                            {/if}
                        </div>
                    {/each}
                </div>
                <div class:scrollbar-hidden={terminalDisplayLines.length <= terminalRows} class="terminal-scrollbar" aria-hidden="true">
                    {#each terminalScrollbarRows as isThumb, index (index)}
                        <span class:terminal-scrollbar-thumb={isThumb}>&nbsp;</span>
                    {/each}
                </div>
            </div>
                </div>
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
        min-width: 0;
        max-width: 100vw;
        margin: 0;
        color: white;
        font-size: var(--grid-font-size);
        line-height: var(--grid-cell-height);
        letter-spacing: var(--grid-letter-spacing);
        font-variant-ligatures: none;
        text-align: start;
    }

    .aligned-content {
        box-sizing: border-box;
        min-width: 0;
        max-width: 100vw;
        padding: var(--grid-cell-height) calc(var(--grid-cell-width) * 2);
        border-radius: 5px;
        background-color: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(20px);
        transform: translateX(var(--overlay-translate-x)) translateY(var(--overlay-translate-y));
    }

    .aligned-content .overlay-tabs {
        display: flex;
        gap: var(--grid-cell-width);
        margin-bottom: var(--grid-cell-height);
        opacity: 1;
        animation: none;
        user-select: none;
    }

    .overlay-panel {
        display: flow-root;
    }

    .terminal-panel {
        box-sizing: border-box;
        max-width: 80ch;
    }

    .overlay-tab {
        width: calc(var(--grid-cell-width) * 8);
        height: var(--grid-cell-height);
        padding: 0;
        border: 0;
        border-radius: 0;
        color: inherit;
        background: transparent;
        font: inherit;
        line-height: var(--grid-cell-height);
        letter-spacing: inherit;
        text-align: start;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
    }

    .overlay-tab:focus-visible {
        outline: none;
    }

    .overlay-tab.active {
        color: black;
        background: white;
    }

    .overlay-overflow .overlay-panels {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: stretch;
    }

    .overlay-overflow .overlay-panel {
        grid-area: 1 / 1;
        min-width: 0;
    }

    .overlay-overflow .overlay-panel-inactive {
        visibility: hidden;
    }

    .terminal-header {
        margin: var(--grid-cell-height) 0;
    }

    .overlay-overflow .terminal-header {
        margin-top: 0;
    }

    .terminal-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) var(--grid-cell-width);
        column-gap: var(--grid-cell-width);
        height: calc(var(--terminal-rows) * var(--grid-cell-height));
        min-width: 0;
        max-width: 100%;
    }

    .terminal-scrollbar.scrollbar-hidden {
        visibility: hidden;
    }

    .terminal-scrollbar {
        display: grid;
        grid-template-rows: repeat(var(--terminal-rows), var(--grid-cell-height));
        width: var(--grid-cell-width);
        height: 100%;
    }

    .terminal-scrollbar span {
        display: block;
        width: 100%;
        height: var(--grid-cell-height);
        line-height: var(--grid-cell-height);
        white-space: pre;
        background-color: rgb(255 255 255 / 12%);
    }

    .terminal-scrollbar .terminal-scrollbar-thumb {
        background-color: rgb(255 255 255 / 70%);
    }

    .terminal {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: 100%;
        overflow: hidden;
        white-space: pre;
    }

    .terminal-line {
        display: flex;
        flex-flow: row nowrap;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: var(--grid-cell-height);
        line-height: var(--grid-cell-height);
        overflow: hidden;
        white-space: pre;
    }

    .terminal-line p {
        flex: 0 0 auto;
        margin: 0;
        white-space: pre;
    }

    .aligned-content .terminal-layout,
    .aligned-content .terminal-scrollbar,
    .aligned-content .terminal-scrollbar span {
        animation: none;
        opacity: 1;
    }

    .aligned-content .terminal *:not(.terminal-cursor) {
        animation: none;
        opacity: 1;
    }

    .aligned-content .terminal p.terminal-cursor {
        flex: 0 0 var(--grid-cell-width);
        box-sizing: border-box;
        width: var(--grid-cell-width);
        min-width: var(--grid-cell-width);
        height: var(--grid-cell-height);
        line-height: var(--grid-cell-height);
        white-space: pre;
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
