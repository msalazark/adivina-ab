"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ admin }: { admin: boolean }) {
  const path = usePathname();
  const links = [
    { href: "/jugar", label: "Jugar", match: (p: string) => p === "/jugar" || p.startsWith("/tests/") },
    { href: "/archivo", label: "Archivo", match: (p: string) => p.startsWith("/archivo") },
    ...(admin ? [{ href: "/admin", label: "Admin", match: (p: string) => p.startsWith("/admin") }] : []),
  ];
  return (
    <nav className="nav" aria-label="Secciones">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
