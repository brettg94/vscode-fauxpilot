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
    // 
    let headRatio = fauxpilotClient.LeadingLinesRatio;
    let promptLinesCount = fauxpilotClient.MaxLines;
    const step = fauxpilotClient.ReduceLineStep;
    const ratioReduce = step / promptLinesCount;

    while (true) {
        const str = getPrompt(doc, pos, headRatio, promptLinesCount);
        if (!str || (typeof str === 'string' && str.length <= 0)) {
            return '';
        }

        const tokenCount = numTokensFromString(str); 
        if (tokenCount < fauxpilotClient.ServerMaxTokens) {
            fauxpilotClient.log(`send token count: ${tokenCount}`);
            return str;
        }
        
        // reduce 2 line once
        if ((promptLinesCount -= step) <= 0) {
            return '';
        }
        
        headRatio = Math.max(0.105, headRatio - ratioReduce);

        fauxpilotClient.log(`reach max token count, current token count: ${tokenCount}, promptLinesCount: ${promptLinesCount}, headRatio: ${headRatio}`);
    }

    return '';
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