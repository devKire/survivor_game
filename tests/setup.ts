import { vi } from "vitest";

// Vitest executes Node services outside Next's RSC resolver. Only the marker is
// mocked; Next builds continue to enforce the actual client/server boundary.
vi.mock("server-only", () => ({}));
