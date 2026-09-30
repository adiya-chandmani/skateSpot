import { redirect } from "next/navigation";

// Sign-up and sign-in are one email-code flow (new emails are registered automatically).
export default function Page() {
  redirect("/sign-in");
}
