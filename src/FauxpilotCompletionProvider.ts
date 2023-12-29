
import OpenAI from 'openai';
import {
    CancellationToken, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, Position, ProviderResult, Range,
    TextDocument, workspace, StatusBarItem, OutputChannel, WorkspaceConfiguration, InlineCompletionTriggerKind
} from 'vscode';

import { nextId,delay, limitTextLength } from './Utils';
import { LEADING_LINES_PROP } from './Constants';
import { fauxpilotClient } from './FauxpilotClient';
import { fetch } from './AccessBackend';


export class FauxpilotCompletionProvider implements InlineCompletionItemProvider {
    cachedPrompts: Map<string, number> = new Map<string, number>();

    private requestStatus: string = "done";
    private statusBar: StatusBarItem;
    private extConfig: WorkspaceConfiguration;
    private userPressKeyCount = 0;

    private lastResponseTime: number;
    private lastResponse: Array<InlineCompletionItem>;


    constructor(statusBar: StatusBarItem, extConfig: WorkspaceConfiguration) {
        this.statusBar = statusBar;
        this.extConfig = extConfig;
        this.lastResponse = [];
        this.lastResponseTime = 0;
    }

    //@ts-ignore
    // because ASYNC and PROMISE
    public async provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionItem[] | InlineCompletionList> {
        fauxpilotClient.log(`call inline: ${position.line}:${position.character}`);

        const currentTimestamp = Date.now();
        if (this.lastResponse.length > 0 && currentTimestamp - this.lastResponseTime < 95) {
            var a = this.lastResponse;
            this.lastResponse = [];
            return a;
        }
        
        try {
            if (!fauxpilotClient.isEnabled) {
                fauxpilotClient.log("Extension not enabled, skipping.");
                return;
            }

            var fileExt = document.fileName.split('.').pop();
            if (fileExt && fauxpilotClient.ExcludeFileExts.includes(fileExt)) {
                // check if fileExt in array excludeFileExts
                fauxpilotClient.log("Ignore file ext: " + fileExt);
                return;
            }

            const prompt = limitTextLength(document, position);
            let suggestionDelay = fauxpilotClient.SuggestionDelay;
            if (suggestionDelay > 0) {
                let holdPressId = ++this.userPressKeyCount;
                fauxpilotClient.log(`try await ${suggestionDelay}, ${holdPressId}`);
                await delay(suggestionDelay);
                if (holdPressId != this.userPressKeyCount) {
                    return;
                }
                fauxpilotClient.log(`after await, ${holdPressId}, ${this.userPressKeyCount}`);
                if (token.isCancellationRequested) {
                    fauxpilotClient.log('request cancelled.');
                    return;
                }
            }

            // fauxpilotClient.log(`Requesting completion for prompt: ${prompt}`);
            fauxpilotClient.log(`Requesting completion for prompt, length: ${prompt?.length ?? 0}`);

            if (this.isNil(prompt)) {
                fauxpilotClient.log("Prompt is empty, skipping");
                return Promise.resolve(([] as InlineCompletionItem[]));
            }

            const currentId = nextId();
            this.cachedPrompts.set(currentId, currentTimestamp);

            // check there is no newer request util this.request_status is done
            while (this.requestStatus === "pending") {
                fauxpilotClient.log("pending, and Waiting for response...");
                await delay(200);
                fauxpilotClient.log("current id = " + currentId + " request status = " + this.requestStatus);
                if (this.newestTimestamp() > currentTimestamp) {
                    fauxpilotClient.log("newest timestamp=" + this.newestTimestamp() + "current timestamp=" + currentTimestamp);
                    fauxpilotClient.log("Newer request is pending, skipping");
                    this.cachedPrompts.delete(currentId);
                    return Promise.resolve(([] as InlineCompletionItem[]));
                }
            }

            if (token.isCancellationRequested) {
                fauxpilotClient.log('request cancelled.');
                return;
            }

            fauxpilotClient.log("Calling OpenAi, prompt length: " + prompt?.length);
            const promptStr = prompt?.toString();
            if (!promptStr) {
                return;
            }
            // fauxpilotClient.log(promptStr);

            fauxpilotClient.log("current id = " + currentId + " set request status to pending");
            
            return this.tryComplete(promptStr, position, token).finally(() => {
                fauxpilotClient.log("current id = " + currentId + " set request status to done");
                this.requestStatus = "done";
                this.cachedPrompts.delete(currentId);

                if (fauxpilotClient.ResponseStatus.Status != 200) {
                    var r = fauxpilotClient.ResponseStatus;
                    fauxpilotClient.log("error on fetch response: " + r.Status + ", " + r.StatusText);
                }
            });

        } catch (error) {
            console.log('An error occurred: ' + error);
            if (typeof error === 'string') {
                fauxpilotClient.log("Catch an error: " + error);    
            } else if (error instanceof Error) {
                fauxpilotClient.log(`Catch an error, ${error.name}: ${error.message}`);
                fauxpilotClient.log(`stack: ${error.stack}`);
            } else {
                fauxpilotClient.log('an unknown error!'); 
            }
        }
    }

    private tryComplete(promptStr: string, position: Position, token: CancellationToken, tryTimes = 0): Promise<InlineCompletionItem[]>{
        const empty: InlineCompletionItem[] = [];
        if (tryTimes >= 5) {
            return Promise.resolve(empty);
        }

        this.requestStatus = "pending";
        this.statusBar.tooltip = "Fauxpilot - Working";
        this.statusBar.text = "$(loading~spin)";
        
        const removedStopWord = fauxpilotClient.IsFetchWithoutLineBreak ? "\n" : "";
        return fetch(promptStr, removedStopWord).then(response => {
            this.statusBar.text = "$(light-bulb)";
            
            if (!response) {
                return empty;
            }

            fauxpilotClient.IsFetchWithoutLineBreak = false;
            const result = this.toInlineCompletions(response, position, promptStr);
            if (result.length == 0 && fauxpilotClient.IsFetchWithoutLineBreak) {
                if (token.isCancellationRequested) {
                    fauxpilotClient.log('request cancelled.');
                    fauxpilotClient.IsFetchWithoutLineBreak = false;
                    return empty;
                }
                // resend
                fauxpilotClient.log("Fetching again");
                var tmp = this.tryComplete(promptStr, position, token, tryTimes+1);
                return tmp;
            }

            this.lastResponse = result;
            this.lastResponseTime = Date.now();
            fauxpilotClient.log("inline completions array length: " + result.length);
            return result;
        });
    }

    private isNil(value: String | undefined | null): boolean {
        return value === undefined || value === null || value.length === 0;
    }

    private newestTimestamp() {
        return Array.from(this.cachedPrompts.values()).reduce((a, b) => Math.max(a, b));
    }

    private toInlineCompletions(value: OpenAI.Completion, position: Position, promptStr: string): InlineCompletionItem[] {
        if (!value.choices) {
            return [];
        }
        
        // it seems always return 1 choice.
        let choice1Text = value.choices[0].text; 
        // if (!choice1Text) {
        //     return [];
        // }

        fauxpilotClient.log('Get choice text: ' + choice1Text);
        if (!choice1Text || choice1Text.trim().length <= 0) {
            if (fauxpilotClient.ResendIfEmptyResponse) {
                fauxpilotClient.IsFetchWithoutLineBreak = fauxpilotClient.StopWords.includes("\n");
            }
            return [];
        }

        if (fauxpilotClient.IsTrim1stLineBreak) {
            const lineIndex = choice1Text.indexOf("\n");
            if (lineIndex >= 0) {
                let erase = true; 
                for (let i = 0; i < lineIndex; i++){
                    if (choice1Text[i] != " ") {
                        erase = false;
                        break;
                    }
                }

                if (erase) {
                    choice1Text = choice1Text.substring(lineIndex + 1);
                }
            }
        }

        if (fauxpilotClient.TrimLeadingWhitespace) {
            const trailingWhiteSpace = promptStr.endsWith(" ");
            if (trailingWhiteSpace) {
                // Remove all leading whitespace from choice1Text
                choice1Text = choice1Text.trimStart();
            }
            // Remove all but one leading whitespace
            choice1Text = choice1Text.replace(/^\s+/, ' ');
        }

        return [new InlineCompletionItem(choice1Text, new Range(position, position.translate(0, choice1Text.length)))];
    }

}
