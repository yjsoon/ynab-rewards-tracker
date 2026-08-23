import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("budget API proxy", () => {
  it("forwards the account's HowMuch token to the HowMuch API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: { plans: [] } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("https://rewards.example/api/ynab/plans", {
      headers: {
        Authorization: "Bearer howmuch-token:account-api-key",
      },
    });

    const response = await GET(request, { params: { path: ["plans"] } });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://howmuch.soon.sg/v1/plans",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer account-api-key" }),
      }),
    );
  });

  it("rejects a missing HowMuch token without calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("https://rewards.example/api/ynab/plans", {
      headers: {},
    });

    const response = await GET(request, { params: { path: ["plans"] } });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cannot be redirected by a provider header that disagrees with the credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: { plans: [] } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("https://rewards.example/api/ynab/plans", {
      headers: {
        Authorization: "Bearer ynab-pat",
        "X-Budget-Provider": "howmuch",
      },
    });

    await GET(request, { params: { path: ["plans"] } });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.ynab.com/v1/plans",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer ynab-pat" }),
      }),
    );
  });
});
