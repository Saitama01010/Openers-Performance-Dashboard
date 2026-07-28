import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ConfirmSubmitButton,
  SubmitButton,
} from "@/components/dashboard/action-controls";

describe("dashboard action controls", () => {
  it("renders a semantic submit button with a stable label", () => {
    const markup = renderToStaticMarkup(
      <form>
        <SubmitButton pendingLabel="Saving changes">Save changes</SubmitButton>
      </form>,
    );

    expect(markup).toContain('type="submit"');
    expect(markup).toContain("Save changes");
    expect(markup).not.toContain("Saving changes");
  });

  it("renders a labelled confirmation dialog with cancel and submit actions", () => {
    const markup = renderToStaticMarkup(
      <form>
        <ConfirmSubmitButton
          confirmLabel="Deactivate account"
          description="Existing sessions will end."
          name="status"
          title="Deactivate this account?"
          value="deactivated"
        >
          Deactivate
        </ConfirmSubmitButton>
      </form>,
    );

    expect(markup).toContain("<dialog");
    expect(markup).toContain('aria-describedby="');
    expect(markup).toContain('aria-labelledby="');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('closedby="any"');
    expect(markup).toContain('command="show-modal"');
    expect(markup).toContain('command="close"');
    expect(markup).toContain("commandfor=");
    expect(markup).toContain("Deactivate this account?");
    expect(markup).toContain("Existing sessions will end.");
    expect(markup).toContain('name="status"');
    expect(markup).toContain('value="deactivated"');
    expect(markup).toContain("Cancel");
  });
});
