import { encoding_for_model } from "@dqbd/tiktoken";
import { TextDocument, Position, Range } from "vscode";
import { fauxpilotClient } from "./FauxpilotClient";

let poorManUuid = 0;

// Placeholder for a real Unique ID function
//  Considering how JS works; I don't believe that such naiive implementation
//  will cause any trouble
export function nextId() {
    return `${poorManUuid++}`;
}

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function currentTimeString(): string {
    const now = new Date();
    const hours = `${now.getHours()}`.padStart(2, '0');
    const minutes = `${now.getMinutes()}`.padStart(2, '0');
    const seconds = `${now.getSeconds()}`.padStart(2, '0');
    const ms = `${now.getMilliseconds()}`.padStart(3, '0');
    return `[${hours}:${minutes}:${seconds}:${ms}]`;
}

function numTokensFromString(message: string) {
    const encoder = encoding_for_model("gpt-3.5-turbo");

    const tokens = encoder.encode(message);
    encoder.free();
    return tokens.length;
}

// limit text length by serverMaxTokens
export function limitTextLength(doc: TextDocument, pos: Position): string {
    let headRatio = fauxpilotClient.LeadingLinesRatio;
    let high = fauxpilotClient.MaxLines;
    let low = 0;
    let str = '';
    let tokenCount = 0;
    const tryTimes = fauxpilotClient.ReduceLineTryTimes;


    // First, try with MaxLines
    str = getPrompt(doc, pos, headRatio, high);
    if (!str || (typeof str === 'string' && str.length <= 0)) {
        return '';
    }

    tokenCount = numTokensFromString(str);
    if (tokenCount < fauxpilotClient.ServerMaxTokens) {
        fauxpilotClient.log(`send token count: ${tokenCount}`);
        return str;
    }

    // If token count is too high, use binary search
    let binarySearchCount = 0;
    while (low <= high && binarySearchCount < tryTimes) {
        const mid = Math.floor((low + high) / 2);
        str = getPrompt(doc, pos, headRatio, mid);
        if (!str || (typeof str === 'string' && str.length <= 0)) {
            return '';
        }

        tokenCount = numTokensFromString(str);
        if (tokenCount < fauxpilotClient.ServerMaxTokens) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }

        binarySearchCount++;
    }

    fauxpilotClient.log(`send token count: ${tokenCount}`);
    return getPrompt(doc, pos, headRatio, high);
}


function getPrompt(document: TextDocument, position: Position, headRatio: number, promptLinesCount: number): string {

    // Only determine the content before the cursor
    const currentLine = position.line;                 //  document.lineCount
    if (currentLine <= promptLinesCount) {
        const range = new Range(0, 0, position.line, position.character);
        return document.getText(range);
    } else {
        const leadingLinesCount = Math.floor(headRatio * promptLinesCount);
        const prefixLinesCount = promptLinesCount - leadingLinesCount;
        const firstPrefixLine = Math.max(position.line - prefixLinesCount, 0);

        const leading = document.getText(new Range(0, 0, leadingLinesCount, 200));
        const prefix = document.getText(new Range(firstPrefixLine, 0, position.line, position.character));
        return `${leading}\n${prefix}`;
    }
}