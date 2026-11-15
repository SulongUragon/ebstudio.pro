import { ImageIcon } from "lucide-react";
import Link from "next/link";
import EbookStudio from "./ebook-studio";
import "./logo-empty-state.css";

export default function Home() {
  return (
    <>
      <Link href="/book-images" className="fab-book-images" aria-label="Book Images" title="Book Images">
        <ImageIcon size={20} />
        <span className="fab-label">Book Images</span>
      </Link>
      <EbookStudio />
    </>
  );
}
