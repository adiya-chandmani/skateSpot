import { redirect } from "next/navigation";

// Old path kept for existing links.
export default function Page() {
  redirect("/sign-in");
}
