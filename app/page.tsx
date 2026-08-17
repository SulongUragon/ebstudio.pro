import Link from "next/link";
import EbookStudio from "./ebook-studio";
import "./logo-empty-state.css";

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
          border: "1px solid rgba(143,68,43,.28)",
          borderRadius: 999,
          background: "linear-gradient(180deg, #eee2d5 0%, #e8d8c8 100%)",
          color: "#8f442b",
          textDecoration: "none",
          fontWeight: 800,
          boxShadow: "0 12px 30px rgba(44,35,27,.12)",
        }}
      >
        🖼 Book Images
      </Link>
      <EbookStudio />
    </>
  );
}
