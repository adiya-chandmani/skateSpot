"use client";
import { useParams } from "next/navigation";
import SpotDetail from "@/components/SpotDetail";

export default function SpotPage() {
  const { id } = useParams<{ id: string }>();
  return <SpotDetail id={id} />;
}
