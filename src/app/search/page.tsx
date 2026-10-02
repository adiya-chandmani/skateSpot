import { redirect } from "next/navigation";

// Search now lives in the map panel; keep old links working.
export default function SearchPage() {
  redirect("/");
}
