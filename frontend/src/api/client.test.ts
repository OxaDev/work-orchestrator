import { describe, expect, it } from "vitest";

import { ApiRequestError, unwrap } from "./client";

const response = (status: number, statusText = "") => new Response(null, { status, statusText });

describe("unwrap", () => {
  it("returns data on success", async () => {
    await expect(
      unwrap(Promise.resolve({ data: { a: 1 }, response: response(200) })),
    ).resolves.toEqual({ a: 1 });
  });

  it("throws ApiRequestError carrying the backend error code", async () => {
    const error = { code: "NOT_FOUND", detail: "x", params: { id: "1" } };
    const promise = unwrap(Promise.resolve({ error, response: response(404) }));
    await expect(promise).rejects.toBeInstanceOf(ApiRequestError);
    await expect(promise).rejects.toMatchObject({ status: 404, body: error });
  });

  it("maps non-standard errors to NETWORK_ERROR", async () => {
    const promise = unwrap(
      Promise.resolve({ error: "boom", response: response(502, "Bad Gateway") }),
    );
    await expect(promise).rejects.toMatchObject({
      status: 502,
      body: { code: "NETWORK_ERROR", detail: "Bad Gateway", params: {} },
    });
  });
});
