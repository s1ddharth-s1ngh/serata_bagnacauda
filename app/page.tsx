import { redirect } from "next/navigation";

// Anyone typing the bare domain lands on the guest upload page.
export default function Home() {
  redirect("/upload");
}
