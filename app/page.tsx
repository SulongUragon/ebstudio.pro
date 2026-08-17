import Link from "next/link";
import EbookStudio from "./ebook-studio";

export default function Home() {
  return (
    <>
      <Link
        href="/book-images"
        style={{
          position: "fixed",
          right: 18,
          bottom: 104,
          zIndex: 49,
          padding: "12px 16px",
          borderRadius: 999,
          background: "#191a18",
          color: "#fffefd",
          textDecoration: "none",
          fontWeight: 800,
          boxShadow: "0 12px 30px rgba(0,0,0,.18)",
        }}
      >
        🖼 Book Images
      </Link>
      <EbookStudio />
    </>
  );
}
