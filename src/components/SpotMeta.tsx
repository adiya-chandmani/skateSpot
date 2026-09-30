import { typeLabel } from "@/lib/spot-rules";

export type SpotPin = { id: string; name: string; types: string[]; lat: number; lng: number; created_at?: string };

export default function SpotMeta({ types }: { types: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {types.map((t) => (
        <span key={t} className="chip">
          {typeLabel(t)}
        </span>
      ))}
    </div>
  );
}
