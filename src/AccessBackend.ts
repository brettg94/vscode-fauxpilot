import { fauxpilotClient, RequestType } from "./FauxpilotClient";

// import * as http from 'http'
// import * as https from 'https'
import axios, { AxiosError } from "axios";
import { AxiosInstance } from "axios";
import OpenAI from "openai";

const http = require("http");
const https = require("https");

//  It's quite strange, this does not work. The server received a request with `Connection: close` ,
//     even if using Node to run a simple script, the server receives a request with `Connection: keep-alive`.
//     Currently, whether using OpenAI or axios, it is impossible to achieve keep alive.
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

export class FetchResponseStatus {
  private status = 200;
  private statusText = "";

  constructor(status: number, statusText: string) {
    this.status = status;
    this.statusText = statusText;
  }

  public get Status() {
    return this.status;
  }

  public get StatusText() {
    return this.statusText;
  }
}

class AccessBackendCache {
  private openai: OpenAI;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.openai = new OpenAI({
      apiKey: fauxpilotClient.Token,
      baseURL: fauxpilotClient.BaseUrl,
    });
    this.axiosInstance = axios.create({
      httpAgent,
      httpsAgent,
      baseURL: fauxpilotClient.BaseUrl,
      timeout: 20000,
    });
  }

  public fetchUseOpenAI(data: any): Promise<OpenAI.Completion> {
    return this.openai.completions.create(data);
  }

  public fetchUseAxios(data: any): Promise<OpenAI.Completion> {
    return this.axiosInstance.post("/completions", data).then(
      (response) => {
        fauxpilotClient.ResponseStatus = new FetchResponseStatus(200, "");
        return response.data;
      },
      (error: AxiosError) => {
        fauxpilotClient.ResponseStatus = new FetchResponseStatus(
          error.response?.status ?? 400,
          error.message
        );
      }
    );
  }
}

let cacheInScript: AccessBackendCache;

export function rebuildAccessBackendCache() {
  cacheInScript = new AccessBackendCache();
}

function getCache(): AccessBackendCache {
  if (!cacheInScript) {
    console.log("rebuilding access backend cache");
    rebuildAccessBackendCache();
  }
  return cacheInScript;
}

export function fetch(
  prompt: string,
  removedStopWord: string = ""
): Promise<OpenAI.Completion> {
  const tmpStopWords =
    removedStopWord && removedStopWord.length > 0
      ? fauxpilotClient.StopWords.filter((word) => word !== removedStopWord)
      : fauxpilotClient.StopWords;
  fauxpilotClient.log("tmpStopWords: " + JSON.stringify(tmpStopWords));

  const data: any = {
    model: fauxpilotClient.Model,
    prompt: prompt,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    max_tokens: fauxpilotClient.MaxTokens,
    temperature: fauxpilotClient.Temperature,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    min_p: fauxpilotClient.MinP,
    stop: tmpStopWords,
  };
  if (fauxpilotClient.NegativePrompt) {
    data["negative_prompt"] = fauxpilotClient.NegativePrompt;
    data["guidance_scale"] = 1.2; // Just hardcoding this for now, 1.2 is effective but safe
  }

  if (fauxpilotClient.RequestType == RequestType.OpenAI) {
    return getCache().fetchUseOpenAI(data);
  } else {
    return getCache().fetchUseAxios(data);
  }

  // return null;
}
