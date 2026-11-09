import { ROLE } from "@vaultkeeper/shared/constants";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import type { CsvImportResult } from "@vaultkeeper/shared/schemas/csv";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAuthApi } from "../../test/fake-auth-api";
import { fakeCatalogApi, type FakeCatalogApi } from "../../test/fake-catalog-api";
import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";

const PNG = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "wings.png", {
  type: "image/png",
});

describe("admin image upload + CSV import UI (task 3.21, R-CAT-5, R-CAT-6)", () => {
  let catalog: FakeCatalogApi;

  beforeEach(() => {
    const auth = fakeAuthApi();
    catalog = fakeCatalogApi();
    server.use(...auth.handlers, ...catalog.handlers);
    auth.addAccount({ role: ROLE.ADMIN }, { signedIn: true });
    catalog.addItem({ name: "Wings of Storm" });
  });

  describe("item image", () => {
    it("shows the placeholder, uploads a file and shows the new image", async () => {
      const user = userEvent.setup();
      const item = catalog.items[0];
      renderApp(`/catalog/${item?.id}`);
      const input = await screen.findByLabelText("Upload image");
      expect(screen.getAllByRole("img", { name: "Wings of Storm" })[0]).toHaveAttribute(
        "data-icon",
        "wings",
      );

      await user.upload(input, PNG);
      await waitFor(() => expect(catalog.calls.uploads).toHaveLength(1));
      // jsdom File + Node FormData: the name becomes "blob" in tests (browsers keep it); check bytes.
      expect(catalog.calls.uploads[0]?.file.size).toBe(PNG.size);
      await waitFor(() =>
        expect(screen.getAllByRole("img", { name: "Wings of Storm" })[0]).toHaveAttribute(
          "src",
          `/media/${catalog.items[0]?.imageKey}`,
        ),
      );
    });

    it.each([
      [413, ERROR_CODE.PAYLOAD_TOO_LARGE, "Image exceeds 1048576 bytes", /too large.*1 MB/i],
      [
        422,
        ERROR_CODE.UPLOAD_REJECTED,
        "Only png, jpeg or webp images are accepted",
        /rejected.*png, jpeg or webp/i,
      ],
    ])("%i is shown as a clear error", async (status, code, message, expected) => {
      const user = userEvent.setup();
      catalog.failNextUpload(status, code, message);
      renderApp(`/catalog/${catalog.items[0]?.id}`);
      await user.upload(await screen.findByLabelText("Upload image"), PNG);
      expect(await screen.findByRole("alert")).toHaveTextContent(expected);
      expect(catalog.items[0]?.imageKey).toBeNull();
    });

    it("removes the image", async () => {
      const user = userEvent.setup();
      const item = catalog.items[0];
      if (item) item.imageKey = `catalog/${"c".repeat(64)}.png`;
      renderApp(`/catalog/${item?.id}`);
      await user.click(await screen.findByRole("button", { name: "Remove image" }));
      await waitFor(() =>
        expect(screen.getAllByRole("img", { name: "Wings of Storm" })[0]).toHaveAttribute(
          "data-icon",
        ),
      );
      expect(screen.queryByRole("button", { name: "Remove image" })).not.toBeInTheDocument();
    });
  });

  describe("CSV import page", () => {
    const CSV = new File(["category,name\nwings,A\n"], "catalog.csv", { type: "text/csv" });

    function preview(result: Partial<CsvImportResult>) {
      catalog.importResult = (dryRun) => ({
        dryRun,
        created: 0,
        updated: 0,
        unchanged: 0,
        rows: [],
        errors: [],
        ...result,
      });
    }

    it("links the template CSV", async () => {
      renderApp("/catalog/import");
      expect(await screen.findByRole("link", { name: /template/i })).toHaveAttribute(
        "href",
        "/catalog-template.csv",
      );
    });

    it("previews (dryRun=true): lists created/updated/unchanged, then confirm sends dryRun=false", async () => {
      const user = userEvent.setup();
      preview({
        created: 1,
        updated: 1,
        unchanged: 1,
        rows: [
          {
            row: 2,
            action: "create",
            categorySlug: "wings",
            name: "New Wings",
            itemId: null,
            changes: [],
          },
          {
            row: 3,
            action: "update",
            categorySlug: "wings",
            name: "Wings of Storm",
            itemId: catalog.items[0]?.id ?? null,
            changes: ["reference_price_mc"],
          },
          {
            row: 4,
            action: "unchanged",
            categorySlug: "swords",
            name: "Kris",
            itemId: catalog.items[0]?.id ?? null,
            changes: [],
          },
        ],
      });
      renderApp("/catalog/import");
      const confirm = await screen.findByRole("button", { name: "Confirm import" });
      expect(confirm).toBeDisabled();

      await user.upload(screen.getByLabelText("CSV file"), CSV);
      await user.click(screen.getByRole("button", { name: "Preview" }));
      await waitFor(() => expect(catalog.calls.imports).toHaveLength(1));
      expect(catalog.calls.imports[0]?.dryRun).toBe("true");

      expect(await screen.findByText("1 to create")).toBeInTheDocument();
      expect(screen.getByText("1 to update")).toBeInTheDocument();
      expect(screen.getByText("1 unchanged")).toBeInTheDocument();
      expect(screen.getByRole("row", { name: /New Wings/ })).toHaveTextContent(/create/i);
      expect(screen.getByRole("row", { name: /Wings of Storm/ })).toHaveTextContent(
        /reference_price_mc/,
      );

      expect(confirm).toBeEnabled();
      await user.click(confirm);
      await waitFor(() => expect(catalog.calls.imports).toHaveLength(2));
      expect(catalog.calls.imports[1]?.dryRun).toBe("false");
      expect(await screen.findByRole("status")).toHaveTextContent(
        /imported.*1 created.*1 updated/i,
      );
    });

    it("row errors are listed and Confirm stays disabled", async () => {
      const user = userEvent.setup();
      preview({
        created: 1,
        rows: [
          { row: 2, action: "create", categorySlug: "wings", name: "A", itemId: null, changes: [] },
        ],
        errors: [{ row: 3, issues: [{ column: "category", message: 'Unknown category "pets"' }] }],
      });
      renderApp("/catalog/import");
      await user.upload(await screen.findByLabelText("CSV file"), CSV);
      await user.click(screen.getByRole("button", { name: "Preview" }));

      expect(await screen.findByText(/Row 3/)).toHaveTextContent(
        /category.*Unknown category "pets"/,
      );
      expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
      expect(catalog.calls.imports).toHaveLength(1);
    });

    it("choosing another file discards the previous preview", async () => {
      const user = userEvent.setup();
      preview({ created: 1, rows: [] });
      renderApp("/catalog/import");
      await user.upload(await screen.findByLabelText("CSV file"), CSV);
      await user.click(screen.getByRole("button", { name: "Preview" }));
      await screen.findByText("1 to create");
      await user.upload(screen.getByLabelText("CSV file"), new File(["x"], "other.csv"));
      expect(screen.queryByText("1 to create")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
    });
  });
});
