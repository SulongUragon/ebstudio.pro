import EbookStudio from "./ebook-studio";

export default function Home() {
  return (
    <>
      <a
        href="/blueprint"
        aria-label="Start a book with the Blueprint Engine"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 100,
          padding: "13px 17px",
          borderRadius: 999,
          background: "#31c77d",
          color: "#04130b",
          fontWeight: 900,
          textDecoration: "none",
          boxShadow: "0 12px 36px rgba(0,0,0,.35)",
          maxWidth: "calc(100vw - 36px)",
          textAlign: "center",
        }}
      >
        Start with Blueprint
      </a>
      <EbookStudio />
    </>
  );
}
