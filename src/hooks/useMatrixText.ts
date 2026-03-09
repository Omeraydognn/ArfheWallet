/**
 * useMatrixText.ts
 *
 * A custom React hook that creates a "Matrix-style" text scramble animation.
 * When the revealed state changes, the text cycles through random cipher characters
 * before settling on the final value (reveal) or '••••••' (hidden).
 *
 * Usage:
 *   const displayed = useMatrixText("$8,522.55", isHidden);
 */

import { useState, useEffect, useRef } from "react";

const CIPHER_CHARS = "0123456789ABCDEF9F2D4C8E1A3B7F60E9D2A5C1B4";
const HIDDEN_PLACEHOLDER = "•••••••";

export function useMatrixText(realValue: string, isHidden: boolean): string {
    const [displayed, setDisplayed] = useState(isHidden ? HIDDEN_PLACEHOLDER : realValue);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const frameRef = useRef(0);

    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        frameRef.current = 0;

        const targetText = isHidden ? HIDDEN_PLACEHOLDER : realValue;
        const totalFrames = 12; // Number of scramble frames before settling

        intervalRef.current = setInterval(() => {
            frameRef.current += 1;

            if (frameRef.current >= totalFrames) {
                // Animation done — show the real target
                setDisplayed(targetText);
                if (intervalRef.current) clearInterval(intervalRef.current);
                return;
            }

            // Generate a scrambled version that progressively resolves to target
            const progress = frameRef.current / totalFrames;
            const scrambled = targetText
                .split("")
                .map((char, i) => {
                    // Characters at the start of the string resolve first
                    const resolvedThreshold = Math.floor(progress * targetText.length);
                    if (i < resolvedThreshold) return char;
                    // Keep non-alphanumeric chars (like $, ., ,) unchanged
                    if (!/[a-zA-Z0-9•]/.test(char)) return char;
                    return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
                })
                .join("");

            setDisplayed(scrambled);
        }, 40); // ~25fps scramble

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isHidden, realValue]);

    return displayed;
}
