import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap">
      <div className="notice">
        <h2>No encontramos ese test</h2>
        <p>
          Puede que se haya retirado o que el enlace esté incompleto. Busca otro en el <Link href="/archivo">archivo</Link>.
        </p>
      </div>
    </main>
  );
}
