import { describe, expect, it, vi } from "vitest";

import {
  isBlockedDuringMaintenance,
  readServiceMode,
  SERVICE_MODE_KEY
} from "../src/operations/service-mode";

describe("service mode", () => {
  it("reads the maintenance switch from the existing private KV", async () => {
    const get = vi.fn(async () => "maintenance");
    const mode = await readServiceMode({
      AUTH_STATE_KV: { get }
    } as unknown as Env);

    expect(mode).toBe("maintenance");
    expect(get).toHaveBeenCalledWith(SERVICE_MODE_KEY);
  });

  it("keeps public reads available and blocks state changes and authentication", () => {
    expect(
      isBlockedDuringMaintenance(
        new Request("https://example.com/p/published-research")
      )
    ).toBe(false);
    expect(
      isBlockedDuringMaintenance(new Request("https://example.com/data"))
    ).toBe(false);
    expect(
      isBlockedDuringMaintenance(new Request("https://example.com/login"))
    ).toBe(true);
    expect(
      isBlockedDuringMaintenance(
        new Request("https://example.com/dashboard/projects/project-1/fields", {
          method: "POST"
        })
      )
    ).toBe(true);
  });

  it("fails open when the operations KV is temporarily unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const mode = await readServiceMode({
      AUTH_STATE_KV: {
        get: async () => {
          throw new Error("KV unavailable");
        }
      }
    } as unknown as Env);

    expect(mode).toBe("active");
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
