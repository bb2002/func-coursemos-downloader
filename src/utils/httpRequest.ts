import {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { ClassConstructor, plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import { HttpException } from "./httpException";

type HttpRequestFunction = (
  request: HttpRequest,
  context: InvocationContext
) => Promise<HttpResponseInit>;

export type HttpRequestParams<T> = {
  request: HttpRequest;
  context: InvocationContext;
  body: T;
};

function isHttpResponseInit(obj: any): obj is HttpResponseInit {
  return (
    typeof obj === "object" &&
    obj !== null &&
    ("body" in obj ||
      "jsonBody" in obj ||
      "status" in obj ||
      "headers" in obj ||
      "cookies" in obj ||
      "enableContentNegotiation" in obj)
  );
}

export function httpRequest<T extends object>(
  inDto: ClassConstructor<T>,
  fun: (params: HttpRequestParams<T>) => Promise<object | HttpResponseInit>
): HttpRequestFunction {
  return async (request: HttpRequest, context: InvocationContext) => {
    let body: T;
    try {
      const raw = await request.json();
      body = plainToInstance(inDto, raw);
      await validateOrReject(body);
    } catch (ex) {
      if (Array.isArray(ex)) {
        const messages = ex.flatMap((e) => Object.values(e.constraints || {}));
        return {
          status: 400,
          body: JSON.stringify({
            error: "Bad Request",
            message: messages.join(", "),
          }),
          headers: {
            "Content-Type": "application/json",
          },
        };
      }
      return {
        status: 400,
        body: JSON.stringify({
          error: "Bad Request",
          message: "Invalid request",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    let result: HttpResponseInit;
    try {
      result = await fun({ request, context, body });
      return {
        status: 200,
        body: JSON.stringify(result),
        headers: {
          "Content-Type": "application/json",
        },
      };
    } catch (ex) {
      context.error(ex);
      if (ex instanceof HttpException) {
        return {
          status: ex.status,
          body: JSON.stringify({
            message: ex.message,
            details: ex.details,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        };
      }

      return {
        status: 500,
        body: JSON.stringify({
          message: "Internal Server Error",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      };
    }
  };
}
