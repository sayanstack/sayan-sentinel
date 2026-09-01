import { redirect } from "next/navigation";

/** The domain-scan hero + targets table now live on the Overview page ("/") — the first thing anyone sees. */
export default function TargetsPage() {
  redirect("/");
}
