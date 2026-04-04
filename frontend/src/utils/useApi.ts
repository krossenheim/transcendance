import { HTTPRouteDef } from "@app/shared/api/service/common/endpoints";
import { zodParse } from "@app/shared/api/service/common/zodUtils";
import z from "zod";

export const ApiFailureCode: string = '-99';

export type ApiFailure = {
    code: typeof ApiFailureCode;
    payload: {
        code: number;
        type: 'network' | 'validation' | 'undefined_status';
        message: any;
    }
};

export type DefinedAPIResponse<T extends HTTPRouteDef> = | {
    [StatusCode in keyof T['schema']['response']]: {
        code: StatusCode;
        payload: z.infer<T['schema']['response'][StatusCode]>;
    };
}[keyof T['schema']['response']] | ApiFailure;

export async function apiCall<T extends HTTPRouteDef>(
    route: T,
    options: {
        body?: T['schema']['body'] extends z.ZodType ? z.infer<T['schema']['body']> : any;
        query?: T['schema']['query'] extends z.ZodType ? z.infer<T['schema']['query']> : any;
        params?: T['schema']['params'] extends z.ZodType ? z.infer<T['schema']['params']> : any;
    } = {}
): Promise<DefinedAPIResponse<T>> {
    const token = localStorage.getItem('jwt');

    let url = route.endpoint;
    if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
            url = url.replace(new RegExp(`:${key}\\b`, 'g'), encodeURIComponent(String(value)));
        }
    }

    if (options.query) {
        const qs = new URLSearchParams();
        Object.entries(options.query).forEach(([k, v]) => {
            if (v !== undefined && v !== null) qs.append(k, String(v));
        });
        url += `?${qs.toString()}`;
    }

    try {
        const response = await fetch(url, {
            method: route.method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: options.body ? JSON.stringify(options.body) : null,
        });

        const data = await response.text().catch(() => null);
        const schemaForStatus = route.schema.response[response.status];

        if (schemaForStatus) {
            const validation = zodParse(schemaForStatus, data);

            if (validation.isOk()) {
                console.log(data, response);
                return {
                    code: response.status,
                    payload: validation.unwrap(),
                } as DefinedAPIResponse<T>;
            } else {
                return {
                    code: ApiFailureCode,
                    payload: {
                        code: response.status,
                        type: 'validation',
                        message: validation.unwrapErr(),
                    },
                };
            }
        }

        return {
            code: ApiFailureCode,
            payload: {
                code: response.status,
                type: 'undefined_status',
                message: data,
            },
        };

    } catch (e) {
        return {
            code: ApiFailureCode,
            payload: {
                code: -99,
                type: 'network',
                message: e instanceof Error ? e.message : "Unknown Error",
            },
        };
    }
}
