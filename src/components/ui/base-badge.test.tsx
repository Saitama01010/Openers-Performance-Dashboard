import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge, BadgeDot, badgeVariants } from "@/components/ui/base-badge";

describe("Badge", () => {
  it("renders the shared badge slot and semantic light treatment", () => {
    const markup = renderToStaticMarkup(<Badge appearance="light" variant="success"><BadgeDot />Active</Badge>);

    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain('data-slot="badge-dot"');
    expect(markup).toContain("bg-[var(--success-subtle)]");
  });

  it("supports the requested variants, appearances, sizes, and shapes", () => {
    expect(badgeVariants({ appearance: "outline", shape: "circle", size: "xs", variant: "destructive" })).toContain("rounded-full");
    expect(badgeVariants({ appearance: "ghost", variant: "info" })).toContain("bg-transparent");
  });
});
