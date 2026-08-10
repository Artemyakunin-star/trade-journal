// Ideas screen: cards grid with filters + "new idea".
import Link from "next/link";
import IdeaCard from "@/components/IdeaCard";
import { getAllIdeas } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; trigger?: string; grade?: string }>;
}) {
  const sp = await searchParams;
  let ideas = await getAllIdeas();

  if (sp.status) ideas = ideas.filter((i) => i.status === sp.status);
  if (sp.trigger) ideas = ideas.filter((i) => i.trigger === sp.trigger);
  if (sp.grade === "A") ideas = ideas.filter((i) => i.grade?.startsWith("A"));
  if (sp.grade === "B") ideas = ideas.filter((i) => i.grade?.startsWith("B"));
  if (sp.grade === "C") ideas = ideas.filter((i) => i.grade?.startsWith("C"));
  if (sp.grade === "DF") ideas = ideas.filter((i) => i.grade === "D" || i.grade === "F");

  ideas = [...ideas].reverse(); // newest first

  return (
    <>
      <div className="topbar">
        <h1>Ideas</h1>
        <Link href="/ideas/new" className="btn">+ New idea</Link>
      </div>

      <form className="filters" method="get">
        <select name="status" defaultValue={sp.status ?? ""} className="tj-select">
          <option value="">All statuses</option>
          <option value="PLAYED_OUT">Played out</option>
          <option value="INVALIDATED">Invalidated</option>
          <option value="ACTIVE">Active</option>
        </select>
        <select name="trigger" defaultValue={sp.trigger ?? ""} className="tj-select">
          <option value="">All triggers</option>
          <option value="PLAN">plan</option>
          <option value="LEVEL">level</option>
          <option value="NEWS">news</option>
          <option value="FOMO">fomo</option>
          <option value="TILT">tilt</option>
          <option value="REVENGE">revenge</option>
        </select>
        <select name="grade" defaultValue={sp.grade ?? ""} className="tj-select">
          <option value="">All grades</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="DF">D–F</option>
        </select>
        <button className="btn ghost" type="submit">Filter</button>
        {(sp.status || sp.trigger || sp.grade) && <Link href="/ideas" className="btn ghost">Reset</Link>}
      </form>

      {ideas.length === 0 ? (
        <div className="card section-note">No ideas match. Write one with “+ New idea”.</div>
      ) : (
        <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
          {ideas.map((i) => (
            <IdeaCard key={i.id} idea={i} />
          ))}
        </div>
      )}
    </>
  );
}
