import { WorkspaceConfiguration, OutputChannel, ConfigurationTarget } from "vscode";
import { currentTimeString } from "./Utils";
import { rebuildAccessBackendCache, FetchResponseStatus } from "./AccessBackend";

export enum RequestType {
    OpenAI,
    Aixos
}

export class FauxpilotClient {
    private outputChannel?: OutputChannel;
    private extConfig?: WorkspaceConfiguration;
    private enabled = false;
    private suggestionDelay = 0;
    private excludeFileExts: Array<String>;
    private baseUrl: string;
    private model: string;
    private maxTokens: number;
    private temperature: number;
    private stopWords: string[];
    private token: string;
    private requestType = RequestType.OpenAI;
    private maxLines: number;
    private responseStatus: FetchResponseStatus;
    private serverMaxTokens: number;
    private leadingLinesRatio: number;
    private reduceLineStep: number;
    private trim1stLineBreak = false;
    private resendIfEmptyResponse = false;
    private fetchWithoutLineBreak = false;

    public version: string;
    

    constructor() {
        this.excludeFileExts = [];
        this.baseUrl = '';
        this.model = '<<UNSET>>';
        this.maxTokens = 80;
        this.temperature = 0.5;
        this.stopWords = [];
        this.version = '';
        this.token = '';
        this.maxLines = 150;
        this.responseStatus = new FetchResponseStatus(200, '');
        this.serverMaxTokens = 2048;
        this.leadingLinesRatio = 0.185;
        this.reduceLineStep = 1;
    }

    public init(extConfig: WorkspaceConfiguration, channel: OutputChannel) {

        this.extConfig = extConfig;
        this.outputChannel = channel;
        this.reload(extConfig);
    }

    public reload(extConfig: WorkspaceConfiguration) {
        this.extConfig = extConfig;
        this.enabled = extConfig.get<boolean>("enabled", false) ?? false;
        this.suggestionDelay = extConfig.get("suggestionDelay", 0) ?? 0;
        this.baseUrl = `${extConfig.get("server")}/${extConfig.get("engine")}`;

        this.excludeFileExts = [];
        // let excludeFileExtsConfig = extConfig.get("excludeFileExts", new Map<String, Boolean>());
        let excludeFileExtsConfig: { [key: string]: boolean } = extConfig.get("excludeFileExts", {});
        for (const key in excludeFileExtsConfig as object) {
            if (excludeFileExtsConfig[key]) {
                this.excludeFileExts.push(key);
            }
        }

        this.model = extConfig.get("model") ?? "<<UNSET>>";
        this.maxTokens = extConfig.get("maxTokens", 80);
        this.temperature = extConfig.get("temperature", 0.5);
        this.stopWords = extConfig.get("stopWordsArray", ["\n"]);
        this.token = extConfig.get("token", '');
        this.requestType = extConfig.get("requestType", 'openai') === 'openai' ? RequestType.OpenAI : RequestType.Aixos;
        this.maxLines = extConfig.get("maxLines", 150);
        this.serverMaxTokens = extConfig.get("serverMaxTokens", 2048);
        this.reduceLineStep = extConfig.get("reduceLineStep", 1);
        this.trim1stLineBreak = extConfig.get("trim1stLineBreak", false);
        this.resendIfEmptyResponse = extConfig.get("resendIfEmptyResponse", false);

        this.log(`enabled = ${this.enabled}`);
        this.log(`baseUrl = ${this.baseUrl}`);
        this.log(`suggestionDelay = ${this.suggestionDelay}`);
        this.log(`excludeFileExts = ${this.excludeFileExts}`);
        this.log(`model = ${this.model}`);
        this.log(`maxTokens = ${this.maxTokens}`);
        this.log(`temperature = ${this.temperature}`);
        this.log(`stopWords = ${this.stopWords}`);
        this.log(`token = ${this.token}`);
        this.log(`requestType = ${this.requestType}`);
        this.log(`maxLines = ${this.maxLines}`);
        this.log(`serverMaxTokens = ${this.serverMaxTokens}`);
        this.log(`reduceLineStep = ${this.reduceLineStep}`);
        this.log(`trim1stLineBreak = ${this.trim1stLineBreak}`);
        this.log(`resendIfEmptyResponse = ${this.resendIfEmptyResponse}`);

        rebuildAccessBackendCache();
        this.log("reload config finish.");
    }

    public log(str: string) {
        if (!this.outputChannel) {
            console.log('[Error] outputChannel is undefined!');
            return;
        }
        this.outputChannel?.appendLine(`${currentTimeString()} ${str}`);
    }

    public get isEnabled(): boolean {
        return this.enabled;
    }

    public set isEnabled(value: boolean) {
        if (this.isEnabled !== value) {
            this.enabled = value;
            this.extConfig?.update("enabled", value);
            this.outputChannel?.appendLine("change status to: " + this.enabled);
        }
    }

    public get OutputChannel(): OutputChannel| undefined {
        return this.outputChannel;
    }

    public get SuggestionDelay(): number {
        return this.suggestionDelay;
    }

    public get BaseUrl(): string {
        return this.baseUrl;
    }

    public get ExcludeFileExts(): Array<String> {
        return this.excludeFileExts;
    }

    public get Model(): string {
        return this.model;
    }
    
    public get MaxTokens(): number {
        return this.maxTokens;
    }

    public get MaxLines(): number {
        return this.maxLines;
    }
    public get Temperature(): number {
        return this.temperature;
    }
    public get StopWords(): Array<string> {
        return this.stopWords;
    }

    public get Token(): string {
        return this.token;
    }

    public get RequestType(): RequestType {
        return this.requestType;
    }

    public get ResponseStatus(): FetchResponseStatus {
        return this.responseStatus;
    }

    public set ResponseStatus(value: FetchResponseStatus) {
        this.responseStatus = value;
    }

    public get ServerMaxTokens(): number {
        return this.serverMaxTokens;
    }

    public get LeadingLinesRatio(): number {
        return this.leadingLinesRatio;
    }

    public get ReduceLineStep(): number {
        return this.reduceLineStep;
    }

    public get IsTrim1stLineBreak(): boolean {
        return this.trim1stLineBreak;
    }

    public get ResendIfEmptyResponse(): boolean {
        return this.resendIfEmptyResponse;
    }

    public get IsFetchWithoutLineBreak(): boolean {
        return this.fetchWithoutLineBreak;
    }

    public set IsFetchWithoutLineBreak(value: boolean) {
        this.fetchWithoutLineBreak = value;
    }
    
}

const client = new FauxpilotClient();

export const fauxpilotClient = client;

