// The bar under a trades table with selection checkboxes: pick trades above,
// choose (or type) ONE tag here, and add it to — or strip it from — all of
// them in one click. The checkboxes in the table belong to this form via the
// form="…" attribute, so no form nesting happens inside the table.
import { bulkTagTrades } from "@/app/actions";
import ComboInput from "@/components/ComboInput";

export default function BulkTagBar({ formId, tagOptions }: { formId: string; tagOptions: string[] }) {
  return (
    <form
      id={formId}
      action={bulkTagTrades}
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}
    >
      <span style={{ fontSize: 12, color: "var(--muted)" }}>Tag the selected trades:</span>
      <ComboInput
        name="tag"
        options={tagOptions}
        defaultValue=""
        placeholder="tag…"
        title="Pick a tag from the vocabulary or type a new one (it joins the list for good)"
        width={160}
      />
      <button className="btn btn-sm" type="submit" name="mode" value="add" title="Add this tag to every checked trade above">
        Add to selected
      </button>
      <button className="btn ghost btn-sm" type="submit" name="mode" value="remove" title="Remove this tag from every checked trade above">
        Remove from selected
      </button>
      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>check trades in the first column (the group header checkbox selects all)</span>
    </form>
  );
}
